import db from "../../../db.js";

export const runMatching = async (context) => {

  const { invoice_id, organization_id, config } = context;

  // 1. Check vendor validation
  const validationRes = await db.query(
    `SELECT overall_status, vendor_id, bank_status
     FROM invoice_validation_results
     WHERE invoice_id = $1
     AND organization_id = $2`,
    [invoice_id, organization_id]
  );

  if (
    !validationRes.rows.length ||
    validationRes.rows[0].overall_status !== "VALID"
  ) {
    return { success: false };
  }

  const { vendor_id, bank_status } = validationRes.rows[0];

  // 2. Fetch extracted invoice data
  const invoiceRes = await db.query(
    `SELECT data
     FROM invoice_extracted_data
     WHERE invoice_id = $1
     AND organization_id = $2`,
    [invoice_id, organization_id]
  );

  if (!invoiceRes.rows.length) return { success: false };

  const invoice = invoiceRes.rows[0].data;
  const invoiceTotal = parseFloat(invoice.total_amount || 0);
  const poNumber = invoice.po_number || null;

  // 3. Use injected matching tolerance
  const tolerance =
    config?.matching?.price_variance_percentage ?? 0.02;

  let po = null;
  let missing_po_flag = false;
  let price_variance_flag = false;
  const bank_mismatch_flag = bank_status === "MISMATCH";

  // 4. Direct PO number match
  if (poNumber) {
    const poRes = await db.query(
      `SELECT *
       FROM purchase_orders
       WHERE po_number = $1
       AND organization_id = $2`,
      [poNumber, organization_id]
    );

    if (poRes.rows.length) {
      po = poRes.rows[0];
    }
  }

  // 5. Fallback: vendor + tolerance match
  if (!po) {
    const vendorPOs = await db.query(
      `SELECT *
       FROM purchase_orders
       WHERE vendor_id = $1
       AND organization_id = $2`,
      [vendor_id, organization_id]
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

  // 6. Strict variance validation
  if (po) {
    const poAmount = parseFloat(po.total_amount || 0);
    const variance = Math.abs(invoiceTotal - poAmount) / poAmount;

    if (variance > tolerance) {
      price_variance_flag = true;
    }
  }

  // 7. Persist results
  await db.query(
    `
    INSERT INTO invoice_po_matching_results
    (invoice_id, organization_id, po_number, matching_status,
     missing_po_flag, price_variance_flag, matched_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (invoice_id, organization_id)
    DO UPDATE SET
      po_number = EXCLUDED.po_number,
      matching_status = EXCLUDED.matching_status,
      missing_po_flag = EXCLUDED.missing_po_flag,
      price_variance_flag = EXCLUDED.price_variance_flag,
      matched_at = NOW()
    `,
    [
      invoice_id,
      organization_id,
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