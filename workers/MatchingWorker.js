import pool from "../db.js";
import matchInvoice from "../step4-matching/services/serviceMatching.js";

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

  if (currentState !== "VALIDATING") {
    throw new Error("Invalid state for MatchingWorker");
  }

  const matchingResult = await matchInvoice(invoice_id);

  if (!matchingResult || matchingResult.success !== true) {
    return { nextState: "BLOCKED" };
  }

  if (matchingResult.status === "MISMATCH") {
    return { nextState: "BLOCKED" };
  }

  return {
    nextState: "MATCHING"
  };
}
