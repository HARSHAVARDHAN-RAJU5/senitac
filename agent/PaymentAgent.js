import BaseAgent from "./BaseAgent.js";
import * as PaymentWorker from "../workers/PaymentWorker.js";
import pool from "../db.js";

export default class PaymentAgent extends BaseAgent {

  async plan() {
    return { action: "RUN_PAYMENT_PROCESS" };
  }

  async act() {
    return await PaymentWorker.execute(this.invoice_id);
  }

  async evaluate(observation) {

    if (!observation || observation.success !== true) {

      const retryRes = await pool.query(
        `SELECT payment_retry_count
         FROM invoice_state_machine
         WHERE invoice_id = $1`,
        [this.invoice_id]
      );

      const retryCount = retryRes.rows[0].payment_retry_count || 0;

      if (retryCount < 2) {

        await pool.query(
          `UPDATE invoice_state_machine
           SET payment_retry_count = payment_retry_count + 1
           WHERE invoice_id = $1`,
          [this.invoice_id]
        );

        return {
          nextState: observation.phase === "SCHEDULING"
            ? "APPROVED"
            : "PAYMENT_READY",
          reason: "Retrying payment process"
        };
      }

      return {
        nextState: "BLOCKED",
        reason: "Payment failed after retries"
      };
    }

    if (observation.phase === "SCHEDULING") {
      return {
        nextState: "PAYMENT_READY"
      };
    }

    if (observation.phase === "EXECUTION") {
      return {
        nextState: "COMPLETED"
      };
    }

    return {
      nextState: "BLOCKED"
    };
  }
}
