import db from "../../../db.js";
import { evaluateTax } from "./taxEngineCompliance.js";

export const runCompliance = async (context) => {

  const { invoice_id, organization_id, config } = context;

  const invoiceRes = await db.query(
    `SELECT data
     FROM invoice_extracted_data
     WHERE invoice_id = $1
     AND organization_id = $2`,
    [invoice_id, organization_id]
  );

  if (!invoiceRes.rows.length) return { success: false };

  const invoice = invoiceRes.rows[0].data;

  const matchingRes = await db.query(
    `SELECT *
     FROM invoice_po_matching_results
     WHERE invoice_id = $1
     AND organization_id = $2`,
    [invoice_id, organization_id]
  );

  if (!matchingRes.rows.length) return { success: false };

  const poResult = matchingRes.rows[0];

  const taxResult = await evaluateTax(invoice);

  const invoiceTotal = parseFloat(invoice.total_amount || 0);

  const highValueThreshold =
    config?.approval?.high_value_threshold ?? Infinity;

  return {
    success: true,
    signals: {
      missing_po_flag: poResult.missing_po_flag,
      price_variance_flag: poResult.price_variance_flag,
      tax_status: taxResult.status,
      high_value_flag: invoiceTotal > highValueThreshold
    }
  };
};