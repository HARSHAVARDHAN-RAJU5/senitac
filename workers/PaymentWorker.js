import pool from "../db.js";
import { runPaymentScheduling } from "../modules/step7-payment/services/paymentService.js";

export async function execute(context) {

  const { invoice_id, organization_id } = context;

  if (!invoice_id || !organization_id) {
    throw new Error("PaymentWorker requires invoice_id and organization_id");
  }

  const stateCheck = await pool.query(
    `
    SELECT current_state
    FROM invoice_state_machine
    WHERE invoice_id = $1
      AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  const currentState = stateCheck.rows[0].current_state;

  if (currentState !== "APPROVED" && currentState !== "PAYMENT_READY") {
    throw new Error("Invalid state for PaymentWorker");
  }

  if (currentState === "APPROVED") {

    const paymentResult = await runPaymentScheduling(context);

    if (!paymentResult?.success) {
      return {
        success: false,
        reason: paymentResult?.reason || "Payment scheduling failed"
      };
    }

    return {
      success: true,
      nextState: "PAYMENT_READY"
    };
  }

  if (currentState === "PAYMENT_READY") {
    return {
      success: true,
      nextState: "PAYMENT_READY"
    };
  }

  return {
    success: false,
    reason: "Unhandled payment state"
  };
}