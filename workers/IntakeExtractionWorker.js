import pool from "../db.js";
import { runExtraction } from "../Execution layer/step2-extraction/services/extractionService.js";

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
    return {
      success: false,
      outcome: "STATE_NOT_FOUND"
    };
  }

  if (stateCheck.rows[0].current_state !== "RECEIVED") {
    return {
      success: false,
      outcome: "INVALID_STATE"
    };
  }

  try {

    const extractedData = await runExtraction(invoice_id);

    if (!extractedData || !extractedData.text) {
      return {
        success: false,
        outcome: "EXTRACTION_FAILED"
      };
    }

    return {
      success: true,
      outcome: "EXTRACTION_SUCCESS"
    };

  } catch (err) {

    return {
      success: false,
      outcome: "EXTRACTION_ERROR",
      error: err.message
    };
  }
}
