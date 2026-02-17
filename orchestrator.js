import { createClient } from "redis";
import pool from "./db.js";
import dotenv from "dotenv";
dotenv.config();

import * as IntakeExtractionWorker from "./workers/IntakeExtractionWorker.js";
import * as DuplicateWorker from "./workers/DuplicateWorker.js";
import * as ValidationWorker from "./workers/ValidationWorker.js";
import * as MatchingWorker from "./workers/MatchingWorker.js";
import * as FinancialControlWorker from "./workers/FinancialControlWorker.js";
import * as ApprovalWorker from "./workers/ApprovalWorker.js";
import * as PaymentWorker from "./workers/PaymentWorker.js";
import * as NotificationWorker from "./workers/NotificationWorker.js";

const redis = createClient({
  url: "redis://127.0.0.1:6379"
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});

const STATE_TRANSITIONS = {
  RECEIVED: ["STRUCTURED", "BLOCKED"],
  STRUCTURED: ["DUPLICATE_CHECK", "BLOCKED"],
  DUPLICATE_CHECK: ["VALIDATING", "BLOCKED"],
  VALIDATING: ["MATCHING", "BLOCKED"],
  MATCHING: [
    "PENDING_APPROVAL",
    "WAITING_INFO",
    "EXCEPTION_REVIEW",
    "BLOCKED"
  ],
  PENDING_APPROVAL: ["APPROVED", "BLOCKED"],
  APPROVED: ["PAYMENT_READY"],
  PAYMENT_READY: ["COMPLETED"]
};

function resolveWorker(state) {
  switch (state) {
    case "RECEIVED": return IntakeExtractionWorker;
    case "STRUCTURED": return DuplicateWorker;
    case "DUPLICATE_CHECK": return ValidationWorker;
    case "VALIDATING": return MatchingWorker;
    case "MATCHING": return FinancialControlWorker;
    case "PENDING_APPROVAL": return ApprovalWorker;
    case "APPROVED": return PaymentWorker;
    case "PAYMENT_READY": return PaymentWorker;
    default: return null;
  }
}

async function logAudit(invoice_id, old_state, new_state, reason = null) {
  await pool.query(
    `INSERT INTO audit_event_log
     (invoice_id, old_state, new_state, reason)
     VALUES ($1, $2, $3, $4)`,
    [invoice_id, old_state, new_state, reason]
  );
}

async function processInvoice(invoice_id) {

  while (true) {

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

    if (current_state === "COMPLETED" || current_state === "BLOCKED") {
      console.log("Invoice finished:", current_state);
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

      await logAudit(invoice_id, current_state, "BLOCKED", "RETRY_LIMIT_EXCEEDED");

      console.log("Retry limit exceeded → BLOCKED");
      return;
    }

    const Worker = resolveWorker(current_state);

    if (!Worker || !Worker.execute) {
      console.log("No worker for state:", current_state);
      return;
    }

    try {

      const result = await Worker.execute(invoice_id);

      if (!result || !result.nextState) {
        throw new Error("Worker did not return nextState");
      }

      const allowed = STATE_TRANSITIONS[current_state] || [];

      if (!allowed.includes(result.nextState)) {
        throw new Error(
          `Illegal transition from ${current_state} to ${result.nextState}`
        );
      }
      
      if (result.nextState === "WAITING_INFO") {

        await pool.query(
          `UPDATE invoice_state_machine
           SET current_state = $1,
               retry_count = 0,
               waiting_since = NOW(),
               waiting_deadline = NOW() + INTERVAL '10 days',
               waiting_reason = $2,
               last_updated = NOW()
           WHERE invoice_id = $3`,
          [result.nextState, result.reason || "MISSING_INFO", invoice_id]
        );

        await logAudit(
          invoice_id,
          current_state,
          "WAITING_INFO",
          result.reason
        );

        console.log("Moved to WAITING_INFO");

        await NotificationWorker.execute(invoice_id, result.reason);

        return; // pause until Redis event resumes
      }

      await pool.query(
        `UPDATE invoice_state_machine
         SET current_state = $1,
             retry_count = 0,
             waiting_since = NULL,
             waiting_deadline = NULL,
             waiting_reason = NULL,
             last_updated = NOW()
         WHERE invoice_id = $2`,
        [result.nextState, invoice_id]
      );

      await logAudit(
        invoice_id,
        current_state,
        result.nextState,
        result.reason || null
      );

      console.log("Moved to:", result.nextState);

    } catch (err) {

      console.error("Worker failed:", err.message);

      await pool.query(
        `UPDATE invoice_state_machine
         SET retry_count = retry_count + 1,
             last_updated = NOW()
         WHERE invoice_id = $1`,
        [invoice_id]
      );

      return;
    }
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
