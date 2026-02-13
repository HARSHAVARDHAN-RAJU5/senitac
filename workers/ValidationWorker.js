import pool from "../db.js";
import validateVendor from "../step3-validation/services/serviceValidation.js";

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

  if (currentState !== "STRUCTURED") {
    throw new Error("Invalid state for ValidationWorker");
  }

  const validationResult = await validateVendor(invoice_id);

  if (!validationResult || validationResult.success !== true) {
    return { nextState: "BLOCKED" };
  }

  if (validationResult.status === "BLOCKED") {
    return { nextState: "BLOCKED" };
  }

  if (validationResult.status === "REVIEW_REQUIRED") {
    return { nextState: "BLOCKED" };
  }

  return {
    nextState: "VALIDATING"
  };
}
