import { createClient } from "redis";
import pool from "./db.js";
import dotenv from "dotenv";
dotenv.config();

import SupervisorAgent from "./agent/SupervisorAgent.js";
import * as NotificationWorker from "./workers/NotificationWorker.js";
import * as InternalNotificationWorker from "./workers/NotificationWorker.js";

const redis = createClient({
  url: "redis://127.0.0.1:6379"
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});

const STATE_TRANSITIONS = {
  RECEIVED: ["STRUCTURED","WAITING_INFO","BLOCKED"],
  STRUCTURED: ["DUPLICATE_CHECK", "BLOCKED"],
  DUPLICATE_CHECK: ["VALIDATING", "BLOCKED"],
  VALIDATING: ["MATCHING", "WAITING_INFO", "BLOCKED"],
  MATCHING: [
    "PENDING_APPROVAL",
    "WAITING_INFO",
    "EXCEPTION_REVIEW",
    "BLOCKED"
  ],
  EXCEPTION_REVIEW: ["PENDING_APPROVAL", "BLOCKED"],
  PENDING_APPROVAL: ["APPROVED", "EXCEPTION_REVIEW", "BLOCKED"],
  APPROVED: ["PAYMENT_READY","EXCEPTION_REVIEW"],
  PAYMENT_READY: ["COMPLETED"]
};

async function logAudit(invoice_id, old_state, new_state, reason = null) {
  await pool.query(
    `INSERT INTO audit_event_log
     (invoice_id, old_state, new_state, reason)
     VALUES ($1, $2, $3, $4)`,
    [invoice_id, old_state, new_state, reason]
  );
}

async function processInvoice(invoice_id) {

  const stateRes = await pool.query(
    `SELECT current_state, retry_count
     FROM invoice_state_machine
     WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!stateRes.rows.length) {
    console.log("State not found:", invoice_id);
    return;
  }

  const { current_state, retry_count } = stateRes.rows[0];

  console.log("Current State:", current_state);

  if (
    current_state === "COMPLETED" ||
    current_state === "BLOCKED" ||
    current_state === "WAITING_INFO"
  ) {
    console.log("Processing paused at:", current_state);
    return;
  }

  if (retry_count >= 3) {

    await pool.query(
      `UPDATE invoice_state_machine
       SET current_state = 'BLOCKED',
           last_updated = NOW()
       WHERE invoice_id = $1`,
      [invoice_id]
    );

    await logAudit(
      invoice_id,
      current_state,
      "BLOCKED",
      "RETRY_LIMIT_EXCEEDED"
    );

    console.log("Retry limit exceeded. Blocking invoice.");
    return;
  }

  try {

    const supervisor = new SupervisorAgent(invoice_id);
    const { decision } = await supervisor.executeStep();

    if (!decision || !decision.nextState) {
      throw new Error("Invalid decision from Supervisor");
    }

    const allowed = STATE_TRANSITIONS[current_state] || [];

    if (!allowed.includes(decision.nextState)) {
      throw new Error(
        `Illegal transition from ${current_state} to ${decision.nextState}`
      );
    }

    await pool.query(
      `UPDATE invoice_state_machine
       SET current_state = $1,
           retry_count = 0,
           last_updated = NOW()
       WHERE invoice_id = $2`,
      [decision.nextState, invoice_id]
    );

    await logAudit(
      invoice_id,
      current_state,
      decision.nextState,
      decision.reason || null
    );

    console.log("Moved to:", decision.nextState);


    if (decision.nextState === "WAITING_INFO") {
      await NotificationWorker.execute(
        invoice_id,
        decision.reason
      );
    }

    if (decision.nextState === "EXCEPTION_REVIEW") {
      await InternalNotificationWorker.execute(
        invoice_id,
        decision.reason
      );
    }

    if (
      decision.nextState !== "WAITING_INFO" &&
      decision.nextState !== "BLOCKED" &&
      decision.nextState !== "COMPLETED"
    ) {
      await redis.xAdd("invoice_events", "*", { invoice_id });
    }

  } catch (err) {

    console.error("Supervisor failed:", err.message);

    await pool.query(
      `UPDATE invoice_state_machine
       SET retry_count = retry_count + 1,
           last_updated = NOW()
       WHERE invoice_id = $1`,
      [invoice_id]
    );
  }
}

async function listen() {

  console.log("Orchestrator connected to Redis & Postgres");

  while (true) {

    try {

      const response = await redis.xReadGroup(
        "orchestrator_group",
        "orchestrator_1",
        {
          key: "invoice_events",
          id: ">"
        },
        {
          COUNT: 1,
          BLOCK: 5000
        }
      );

      if (!response) continue;

      const message = response[0].messages[0];
      const { invoice_id } = message.message;

      console.log("Event received:", invoice_id);

      await processInvoice(invoice_id);

      await redis.xAck(
        "invoice_events",
        "orchestrator_group",
        message.id
      );

    } catch (error) {
      console.error("Listener Error:", error);
    }
  }
}


async function start() {
  await redis.connect();
  await listen();
}

start();
