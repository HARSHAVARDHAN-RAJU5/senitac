import { createClient } from "redis";
import pool from "./db.js";

import * as IntakeExtractionWorker from "./workers/IntakeExtractionWorker.js";
import * as FinancialControlWorker from "./workers/FinancialControlWorker.js";
import * as ApprovalWorker from "./workers/ApprovalWorker.js";
import * as PaymentWorker from "./workers/PaymentWorker.js";

const redis = createClient({
  url: "redis://127.0.0.1:6379"
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});


const STATE_TRANSITIONS = {
  RECEIVED: ["STRUCTURED"],
  STRUCTURED: ["VALIDATING"],
  VALIDATING: ["MATCHING", "BLOCKED"],
  MATCHING: ["RISK_REVIEW", "BLOCKED"],
  RISK_REVIEW: ["PENDING_APPROVAL", "BLOCKED"],
  PENDING_APPROVAL: ["APPROVED", "BLOCKED"],
  APPROVED: ["PAYMENT_READY"],
  PAYMENT_READY: ["COMPLETED"]
};


function resolveWorker(state) {
  switch (state) {
    case "RECEIVED":
      return IntakeExtractionWorker;

    case "STRUCTURED":
      return ValidationWorker;

    case "VALIDATING":
      return MatchingWorker;

    case "MATCHING":
      return FinancialControlWorker;

    case "RISK_REVIEW":
      return ApprovalWorker;

    case "APPROVED":
      return PaymentWorker;

    default:
      return null;
  }
}

async function processInvoice(invoice_id) {
  while (true) {
    const stateRes = await pool.query(
      "SELECT current_state, retry_count FROM invoice_state_machine WHERE invoice_id = $1",
      [invoice_id]
    );

    if (stateRes.rows.length === 0) {
      console.log("State not found for:", invoice_id);
      return;
    }

    const { current_state, retry_count } = stateRes.rows[0];

    console.log("Current State:", current_state);

    if (current_state === "COMPLETED" || current_state === "BLOCKED") {
      console.log("Invoice finished:", current_state);
      return;
    }

    if (retry_count >= 3) {
      console.log("Retry limit exceeded → BLOCKED");

      await pool.query(
        `UPDATE invoice_state_machine
         SET current_state = 'BLOCKED',
             updated_at = NOW()
         WHERE invoice_id = $1`,
        [invoice_id]
      );

      return;
    }

    const Worker = resolveWorker(current_state);

    if (!Worker || !Worker.execute) {
      console.log("No worker for state:", current_state);
      return;
    }

    try {
      const result = await Worker.execute(invoice_id);

      const allowed = STATE_TRANSITIONS[current_state] || [];

      if (!allowed.includes(result.nextState)) {
        throw new Error(
          `Illegal transition from ${current_state} to ${result.nextState}`
        );
      }

      await pool.query(
        `UPDATE invoice_state_machine
         SET current_state = $1,
             retry_count = 0,
             updated_at = NOW()
         WHERE invoice_id = $2`,
        [result.nextState, invoice_id]
      );

      console.log("Moved to:", result.nextState);

    } catch (err) {
      console.error("Worker failed:", err.message);

      await pool.query(
        `UPDATE invoice_state_machine
         SET retry_count = retry_count + 1,
             updated_at = NOW()
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
