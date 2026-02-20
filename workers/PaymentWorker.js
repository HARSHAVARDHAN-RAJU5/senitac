import pool from "../db.js";
import { runPaymentScheduling } from "../Execution layer/step7-payment/services/paymentService.js";

export async function execute(invoice_id, organization_id) {

  if (!invoice_id || !organization_id) {
    throw new Error("PaymentWorker requires invoice_id and organization_id");
  }

  // Tenant isolated state check
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

  // Allow only APPROVED or PAYMENT_READY
  if (currentState !== "APPROVED" && currentState !== "PAYMENT_READY") {
    throw new Error("Invalid state for PaymentWorker");
  }

  if (currentState === "APPROVED") {

    const paymentResult = await runPaymentScheduling(
      invoice_id,
      organization_id
    );

    if (!paymentResult?.success) {
      return {
        success: false,
        nextState: "BLOCKED",
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
}