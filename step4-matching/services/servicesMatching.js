import db from "../../db.js";

async function matchInvoice(invoiceId) {

  const validation = await db.query(
    "SELECT overall_status FROM invoice_validation_results WHERE invoice_id = $1",
    [invoiceId]
  );

  if (!validation.rows.length || validation.rows[0].overall_status !== "VALID") {
    return {
      success: false,
      status: "BLOCKED",
      reason: "Invoice not eligible for PO matching"
    };
  }

  const extractedResult = await db.query(
    "SELECT data FROM invoice_extracted_data WHERE invoice_id = $1",
    [invoiceId]
  );

  if (!extractedResult.rows.length) {
    return {
      success: false,
      status: "BLOCKED",
      reason: "No extracted invoice data found"
    };
  }

  const extracted = extractedResult.rows[0].data;

  const poNumber = extracted.po_number;
  const invoiceTotal = extracted.invoice_total;

  if (!poNumber) {
    await storeResult(invoiceId, null, "MISMATCH", true, false, true);

    return {
      success: true,
      status: "MISMATCH",
      flags: { missing_po: true }
    };
  }

  const poResult = await db.query(
    "SELECT * FROM purchase_orders WHERE po_number = $1",
    [poNumber]
  );

  if (!poResult.rows.length) {
    await storeResult(invoiceId, poNumber, "MISMATCH", true, false, false);

    return {
      success: true,
      status: "MISMATCH",
      flags: { missing_po: true }
    };
  }

  const po = poResult.rows[0];

  const tolerance = 0.02;
  const variance = Math.abs(invoiceTotal - po.total_amount) / po.total_amount;

  const priceVarianceFlag = variance > tolerance;

  const matchingStatus = priceVarianceFlag ? "PARTIAL_MATCH" : "MATCHED";

  await storeResult(
    invoiceId,
    poNumber,
    matchingStatus,
    false,
    priceVarianceFlag,
    false
  );

  return {
    success: true,
    status: matchingStatus,
    flags: {
      price_variance: priceVarianceFlag
    }
  };
}

async function storeResult(
  invoiceId,
  poNumber,
  status,
  missingPoFlag,
  priceVarianceFlag,
  missingReceiptFlag
) {
  await db.query(
    `INSERT INTO invoice_po_matching_results
    (invoice_id, po_number, matching_status,
     missing_po_flag, price_variance_flag, missing_receipt_flag, matched_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
    [
      invoiceId,
      poNumber,
      status,
      missingPoFlag,
      priceVarianceFlag,
      missingReceiptFlag
    ]
  );
}

export default matchInvoice;
