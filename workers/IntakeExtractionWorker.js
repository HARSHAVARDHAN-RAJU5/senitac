import pool from "../db.js";
import { runExtraction } from "../step2-extraction/services/extractionService.js";

class IntakeExtractionWorker {

  async execute(invoice_id) {

    const stateCheck = await pool.query(
      `
      SELECT current_state
      FROM invoice_state_machine
      WHERE invoice_id = $1
      `,
      [invoice_id]
    );

    if (stateCheck.rows.length === 0) {
      throw new Error("State record not found");
    }

    const currentState = stateCheck.rows[0].current_state;

    if (currentState !== "RECEIVED") {
      throw new Error("Invalid state for IntakeExtractionWorker");
    }

    const extractedData = await runExtraction(invoice_id);

    if (!extractedData || !extractedData.text) {
      throw new Error("Extraction failed");
    }

    return {
      next_state: "STRUCTURED"
    };
  }
}

export default new IntakeExtractionWorker();
