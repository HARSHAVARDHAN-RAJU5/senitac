import pool from "../db.js";
import { runPaymentScheduling } from "../step7-payment/services/paymentService.js";

export async function execute(invoice_id) {

  const stateCheck = await pool.query(
    `
      SELECT current_state
      FROM invoice_state_machine
      WHERE invoice_id = $1
    `,
    [invoice_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  const currentState = stateCheck.rows[0].current_state;

  // Allow only APPROVED or PAYMENT_READY
  if (currentState !== "APPROVED" && currentState !== "PAYMENT_READY") {
    throw new Error("Invalid state for PaymentWorker");
  }

  // Phase 1 → Create payment schedule
  if (currentState === "APPROVED") {

    const paymentResult = await runPaymentScheduling(invoice_id);

    if (!paymentResult || paymentResult.success !== true) {
      return { nextState: "BLOCKED" };
    }

    return { nextState: "PAYMENT_READY" };
  }

  // Phase 2 → Execute payment (simulated for now)
  if (currentState === "PAYMENT_READY") {

    await pool.query(
      `
      UPDATE invoice_payment_schedule
      SET payment_status = 'PAID',
          paid_at = NOW()
      WHERE invoice_id = $1
      `,
      [invoice_id]
    );

    return { nextState: "COMPLETED" };
  }
}
