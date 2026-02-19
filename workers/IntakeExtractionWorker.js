import pool from "../db.js";
import extractAndStructure from "../Execution layer/step2-extraction/services/extractionService.js";

export async function execute(invoice_id) {

  const stateCheck = await pool.query(
    `SELECT current_state FROM invoice_state_machine WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  if (stateCheck.rows[0].current_state !== "RECEIVED") {
    throw new Error("Invalid state for ExtractionWorker");
  }

  const result = await extractAndStructure(invoice_id);

  return result;
}
