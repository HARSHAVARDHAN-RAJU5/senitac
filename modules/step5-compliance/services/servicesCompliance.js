import db from "../../../db.js";
import { evaluateTax } from "./taxEngineCompliance.js";

export const runCompliance = async (context) => {

  const { invoice_id, organization_id, config } = context;

  if (!invoice_id || !organization_id) {
    throw new Error("runCompliance requires invoice_id and organization_id");
  }

  const invoiceRes = await db.query(
    `
    SELECT data
    FROM invoice_extracted_data
    WHERE invoice_id = $1
      AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!invoiceRes.rows.length) {
    return { success: false, reason: "Extracted invoice data not found" };
  }

  const invoice = invoiceRes.rows[0].data || {};

  const matchingRes = await db.query(
    `
    SELECT *
    FROM invoice_po_matching_results
    WHERE invoice_id = $1
      AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!matchingRes.rows.length) {
    return { success: false, reason: "Matching results not found" };
  }

  const poResult = matchingRes.rows[0];

  // Run tax evaluation
  const taxResult = await evaluateTax(invoice);

  const invoiceTotal = parseFloat(invoice.total_amount || 0);

  const highValueThreshold =
    config?.approval?.high_value_threshold ?? Infinity;

  const highValueFlag = invoiceTotal > highValueThreshold;

  const overallStatus =
    taxResult.status === "PASS" &&
    !poResult.price_variance_flag &&
    !poResult.missing_po_flag
      ? "PASS"
      : "FAIL";

  // Persist compliance result
  await db.query(
    `
    INSERT INTO invoice_compliance_results
      (invoice_id, organization_id,
       tax_compliance_status,
       policy_compliance_status,
       overall_compliance_status,
       evaluated_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    ON CONFLICT (invoice_id, organization_id)
    DO UPDATE SET
      tax_compliance_status = EXCLUDED.tax_compliance_status,
      policy_compliance_status = EXCLUDED.policy_compliance_status,
      overall_compliance_status = EXCLUDED.overall_compliance_status,
      evaluated_at = NOW()
    `,
    [
      invoice_id,
      organization_id,
      taxResult.status,
      highValueFlag ? "REVIEW_REQUIRED" : "PASS",
      overallStatus
    ]
  );

  return {
    success: true,
    signals: {
      missing_po_flag: poResult.missing_po_flag,
      price_variance_flag: poResult.price_variance_flag,
      tax_status: taxResult.status,
      high_value_flag: highValueFlag
    }
  };
};