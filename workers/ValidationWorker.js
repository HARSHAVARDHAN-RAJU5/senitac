import pool from "../db.js";
import validateVendor from "../step3-validation/services/servicesValidation.js";

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

  console.log("Validation Result:", validationResult);

  if (!validationResult) {
    await storeError(invoice_id, "Vendor validation returned null");
    return { nextState: "BLOCKED" };
  }

  if (validationResult.success !== true) {
    const reason = validationResult.reason || "Vendor validation failed";
    await storeError(invoice_id, reason);
    return { nextState: "BLOCKED" };
  }

  if (validationResult.status === "BLOCKED") {
    const reason = validationResult.reason || "Vendor explicitly blocked";
    await storeError(invoice_id, reason);
    return { nextState: "BLOCKED" };
  }

  if (validationResult.status === "REVIEW_REQUIRED") {
    const reason = validationResult.reason || "Vendor requires review";
    await storeError(invoice_id, reason);
    return { nextState: "RISK_REVIEW" };
  }

  return { nextState: "VALIDATING" };
}

async function storeError(invoice_id, reason) {
  console.log("Vendor Failed Reason:", reason);

  await pool.query(
    `
      UPDATE invoice_state_machine
      SET error_reason = $1,
          last_updated = NOW()
      WHERE invoice_id = $2
    `,
    [reason, invoice_id]
  );
}
