import pool from "../db.js";
import validateVendor from "../Execution layer/step3-validation/services/servicesValidation.js";

export async function execute(invoice_id) {

  // 1️⃣ Ensure correct state
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

  // 2️⃣ Execute deterministic validation logic
  const validationResult = await validateVendor(invoice_id);

  console.log("Validation Result:", validationResult);

  // 3️⃣ Persist error reason if present
  if (!validationResult) {
    await storeError(invoice_id, "Vendor validation returned null");
    return {
      success: false,
      status: "ERROR",
      reason: "Vendor validation returned null"
    };
  }

  if (validationResult.success !== true) {
    const reason = validationResult.reason || "Vendor validation failed";
    await storeError(invoice_id, reason);
  }

  if (validationResult.status === "BLOCKED") {
    const reason = validationResult.reason || "Vendor explicitly blocked";
    await storeError(invoice_id, reason);
  }

  if (validationResult.status === "REVIEW_REQUIRED") {
    const reason = validationResult.reason || "Vendor requires review";
    await storeError(invoice_id, reason);
  }

  // 4️⃣ Return raw deterministic result
  return validationResult;
}


async function storeError(invoice_id, reason) {
  console.log("Vendor Failure Reason:", reason);

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
