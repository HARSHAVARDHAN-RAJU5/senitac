import db from "../../../db.js";
import { evaluateTax } from "./taxEngineCompliance.js";
import { evaluatePolicy } from "./policyEngineCompliance.js";
import { finalDecision } from "./decisionServices.js";

export const runCompliance = async (invoice_id) => {

  const invoiceRes = await db.query(
    "SELECT data FROM invoice_extracted_data WHERE invoice_id = $1",
    [invoice_id]
  );

  if (!invoiceRes.rows.length) {
    return {
      success: false,
      status: "BLOCKED",
      reason: "Invoice not found"
    };
  }

  const invoice = invoiceRes.rows[0].data;

  const step3Res = await db.query(
    "SELECT overall_status FROM invoice_validation_results WHERE invoice_id = $1",
    [invoice_id]
  );

  if (!step3Res.rows.length || step3Res.rows[0].overall_status !== "VALID") {
    return {
      success: false,
      status: "BLOCKED",
      reason: "Invoice not eligible for compliance"
    };
  }

  const poRes = await db.query(
    "SELECT * FROM invoice_po_matching_results WHERE invoice_id = $1",
    [invoice_id]
  );

  if (!poRes.rows.length) {
    return {
      success: false,
      status: "BLOCKED",
      reason: "PO matching result not found"
    };
  }

  const poResult = poRes.rows[0];

  const taxResult = await evaluateTax(invoice);
  const policyResult = evaluatePolicy(invoice, poResult);

  const overall = finalDecision(taxResult, policyResult);

  await db.query(
    `
    INSERT INTO invoice_compliance_results
    (invoice_id, tax_compliance_status, policy_compliance_status, overall_compliance_status, evaluated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (invoice_id)
    DO UPDATE SET
      tax_compliance_status = EXCLUDED.tax_compliance_status,
      policy_compliance_status = EXCLUDED.policy_compliance_status,
      overall_compliance_status = EXCLUDED.overall_compliance_status,
      evaluated_at = NOW()
    `,
    [
      invoice_id,
      taxResult.status,
      policyResult.status,
      overall
    ]
  );

  return {
    success: true,
    status: overall,
    tax_status: taxResult.status,
    policy_status: policyResult.status
  };
};
