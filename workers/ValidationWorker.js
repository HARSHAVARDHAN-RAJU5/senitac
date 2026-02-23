import pool from "../db.js";
import validateVendor from "../modules/step3-validation/services/servicesValidation.js";

export async function execute(context) {

  const { invoice_id, organization_id } = context;

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

  if (stateCheck.rows[0].current_state !== "VALIDATING") {
    throw new Error("Invalid state for ValidationWorker");
  }

  const validationResult = await validateVendor(context);

  if (!validationResult) {
    return {
      success: false,
      status: "ERROR",
      reason: "Vendor validation returned null"
    };
  }

  if (validationResult.status !== "VALID") {
    await pool.query(
      `
      UPDATE invoice_state_machine
      SET error_reason = $1,
          last_updated = NOW()
      WHERE invoice_id = $2
        AND organization_id = $3
      `,
      [
        validationResult.reason,
        invoice_id,
        organization_id
      ]
    );
  }

  return validationResult;
}