import db from "../../../db.js";
import { evaluateTax } from "./taxEngineCompliance.js";
import policyConfig from "../rules/policyRules.js";

export const runCompliance = async (invoice_id) => {

  const invoiceRes = await db.query(
    "SELECT data FROM invoice_extracted_data WHERE invoice_id = $1",
    [invoice_id]
  );

  if (!invoiceRes.rows.length) return { success: false };

  const invoice = invoiceRes.rows[0].data;

  const matchingRes = await db.query(
    "SELECT * FROM invoice_po_matching_results WHERE invoice_id = $1",
    [invoice_id]
  );

  if (!matchingRes.rows.length) return { success: false };

  const poResult = matchingRes.rows[0];

  const taxResult = await evaluateTax(invoice);

  return {
    success: true,
    signals: {
      missing_po_flag: poResult.missing_po_flag,
      price_variance_flag: poResult.price_variance_flag,
      tax_status: taxResult.status,
      high_value_flag:
        parseFloat(invoice.total_amount || 0) >
        policyConfig.approval.highValueThreshold
    }
  };
};
