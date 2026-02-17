import pool from "../db.js";
import matchInvoice from "../Execution layer/step4-matching/services/servicesMatching.js";
import { runCompliance } from "../Execution layer/step5-compliance/services/servicesCompliance.js";

export async function execute(invoice_id) {

  const stateCheck = await pool.query(
    `SELECT current_state FROM invoice_state_machine WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  if (stateCheck.rows[0].current_state !== "VALIDATING") {
    throw new Error("Invalid state for MatchingWorker");
  }

  const matchingResult = await matchInvoice(invoice_id);

  if (!matchingResult || !matchingResult.success) {
    return { success: false, outcome: "MATCHING_FAILED" };
  }

  const complianceResult = await runCompliance(invoice_id);

  if (!complianceResult || !complianceResult.success) {
    return { success: false, outcome: "COMPLIANCE_FAILED" };
  }

  return {
    success: true,
    matching: matchingResult,
    compliance: complianceResult
  };
}
