import pool from "../db.js";
import validateVendor from "../modules/step3-validation/services/servicesValidation.js";

export async function execute(context) {

  const { invoice_id, organization_id } = context;

  if (!invoice_id || !organization_id) {
    throw new Error("ValidationWorker requires invoice_id and organization_id");
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
    throw new Error("State record not found for this organization");
  }

  const currentState = stateCheck.rows[0].current_state;

  if (currentState !== "VALIDATING") {
    throw new Error("Invalid state for ValidationWorker");
  }

  const validationResult = await validateVendor(context);

  if (!validationResult) {
    await storeError(invoice_id, organization_id, "Vendor validation returned null");
    return {
      success: false,
      status: "ERROR",
      reason: "Vendor validation returned null"
    };
  }

  if (validationResult.success !== true) {
    const reason = validationResult.reason || "Vendor validation failed";
    await storeError(invoice_id, organization_id, reason);
  }

  if (validationResult.status === "BLOCKED") {
    const reason = validationResult.reason || "Vendor explicitly blocked";
    await storeError(invoice_id, organization_id, reason);
  }

  if (validationResult.status === "REVIEW_REQUIRED") {
    const reason = validationResult.reason || "Vendor requires review";
    await storeError(invoice_id, organization_id, reason);
  }

  return validationResult;
}

async function storeError(invoice_id, organization_id, reason) {

  await pool.query(
    `
    UPDATE invoice_state_machine
    SET error_reason = $1,
        last_updated = NOW()
    WHERE invoice_id = $2
      AND organization_id = $3
    `,
    [reason, invoice_id, organization_id]
  );
}