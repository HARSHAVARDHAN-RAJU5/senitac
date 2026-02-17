import pool from "../db.js";

export async function execute(invoice_id) {

  const stateCheck = await pool.query(
    `SELECT current_state FROM invoice_state_machine WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  if (stateCheck.rows[0].current_state !== "MATCHING") {
    throw new Error("Invalid state for FinancialControlWorker");
  }

  const validation = await pool.query(
    `SELECT * FROM invoice_validation_results WHERE invoice_id = $1`,
    [invoice_id]
  );

  const matching = await pool.query(
    `SELECT * FROM invoice_po_matching_results WHERE invoice_id = $1`,
    [invoice_id]
  );

  const compliance = await pool.query(
    `SELECT * FROM invoice_compliance_results WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!compliance.rows.length) {
    return { success: false, outcome: "MISSING_REQUIRED_DATA" };
  }

  if (compliance.rows[0].overall_compliance_status === "BLOCKED") {
    return { success: true, outcome: "COMPLIANCE_BLOCKED" };
  }

  const poStatus = matching.rows[0]?.matching_status;

  if (poStatus === "MISMATCH" || poStatus === "PARTIAL_MATCH") {
    return { success: true, outcome: "PO_EXCEPTION" };
  }

  if (validation.rows.length && validation.rows[0].bank_status === "MISMATCH") {
    return { success: true, outcome: "BANK_MISMATCH" };
  }

  return {
    success: true,
    outcome: "READY_FOR_RISK_ANALYSIS",
    data: {
      validation: validation.rows[0] || {},
      po_matching: matching.rows[0] || {},
      compliance: compliance.rows[0]
    }
  };
}
