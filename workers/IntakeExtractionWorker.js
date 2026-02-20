import pool from "../db.js";
import extractAndStructure from "../Execution layer/step2-extraction/services/extractionService.js";

export async function execute(context) {

  const { invoice_id, organization_id } = context;

  if (!invoice_id || !organization_id) {
    throw new Error("ExtractionWorker requires invoice_id and organization_id");
  }

  // Tenant-isolated state validation
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

  if (stateCheck.rows[0].current_state !== "RECEIVED") {
    throw new Error("Invalid state for ExtractionWorker");
  }

  // Phase 4 — pass full context to extraction layer
  const result = await extractAndStructure(context);

  return result;
}