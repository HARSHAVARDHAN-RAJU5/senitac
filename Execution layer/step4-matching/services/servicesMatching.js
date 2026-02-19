import db from "../../../db.js";
import policyConfig from "../../step5-compliance/rules/policyRules.js";

export const runMatching = async (invoice_id) => {

  const validationRes = await db.query(
    "SELECT overall_status, vendor_id, bank_status FROM invoice_validation_results WHERE invoice_id = $1",
    [invoice_id]
  );

  if (!validationRes.rows.length || validationRes.rows[0].overall_status !== "VALID") {
    return { success: false };
  }

  const { vendor_id, bank_status } = validationRes.rows[0];

  const invoiceRes = await db.query(
    "SELECT data FROM invoice_extracted_data WHERE invoice_id = $1",
    [invoice_id]
  );

  if (!invoiceRes.rows.length) return { success: false };

  const invoice = invoiceRes.rows[0].data;
  const invoiceTotal = parseFloat(invoice.total_amount || 0);
  const poNumber = invoice.po_number || null;

  const tolerance = policyConfig.matching.priceVarianceTolerance;

  let po = null;
  let missing_po_flag = false;
  let price_variance_flag = false;
  const bank_mismatch_flag = bank_status === "MISMATCH";

  if (poNumber) {
    const poRes = await db.query(
      "SELECT * FROM purchase_orders WHERE po_number = $1",
      [poNumber]
    );
    if (poRes.rows.length) po = poRes.rows[0];
  }

  if (!po) {
    const vendorPOs = await db.query(
      "SELECT * FROM purchase_orders WHERE vendor_id = $1",
      [vendor_id]
    );

    const matches = vendorPOs.rows.filter(p => {
      const poAmount = parseFloat(p.total_amount || 0);
      if (!poAmount) return false;
      const variance = Math.abs(invoiceTotal - poAmount) / poAmount;
      return variance <= tolerance;
    });

    if (matches.length === 1) {
      po = matches[0];
    } else {
      missing_po_flag = true;
    }
  }

  if (po) {
    const poAmount = parseFloat(po.total_amount || 0);
    const variance = Math.abs(invoiceTotal - poAmount) / poAmount;
    if (variance > tolerance) price_variance_flag = true;
  }

  await db.query(
    `
    INSERT INTO invoice_po_matching_results
    (invoice_id, po_number, matching_status,
     missing_po_flag, price_variance_flag, matched_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    ON CONFLICT (invoice_id)
    DO UPDATE SET
      po_number = EXCLUDED.po_number,
      matching_status = EXCLUDED.matching_status,
      missing_po_flag = EXCLUDED.missing_po_flag,
      price_variance_flag = EXCLUDED.price_variance_flag,
      matched_at = NOW()
    `,
    [
      invoice_id,
      po ? po.po_number : null,
      po ? "MATCHED" : "MISMATCH",
      missing_po_flag,
      price_variance_flag
    ]
  );

  return {
    success: true,
    signals: {
      missing_po_flag,
      price_variance_flag,
      bank_mismatch_flag
    }
  };
};
