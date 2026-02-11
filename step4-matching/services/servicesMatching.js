import db from "../../db.js";

async function matchInvoice(invoiceId) {

  // 1️⃣ Ensure STEP 3 was VALID
  const validation = await db.query(
    "SELECT overall_status FROM invoice_validation_results WHERE invoice_id = $1",
    [invoiceId]
  );

  if (validation.rows.length === 0 || validation.rows[0].overall_status !== "VALID") {
    return {
      invoice_id: invoiceId,
      message: "Invoice not eligible for PO matching"
    };
  }

  // 2️⃣ Get extracted invoice data
  const extractedResult = await db.query(
    "SELECT data FROM invoice_extracted_data WHERE invoice_id = $1",
    [invoiceId]
  );

  if (extractedResult.rows.length === 0) {
    throw new Error("No extracted invoice data found");
  }

  const extracted = extractedResult.rows[0].data;

  const poNumber = extracted.po_number;
  const invoiceTotal = extracted.invoice_total;

  if (!poNumber) {
    await storeResult(invoiceId, null, "MISMATCH", true, false, true);
    return {
      invoice_id: invoiceId,
      matching_status: "MISMATCH",
      flags: { missing_po: true }
    };
  }

  // 3️⃣ Fetch Purchase Order
  const poResult = await db.query(
    "SELECT * FROM purchase_orders WHERE po_number = $1",
    [poNumber]
  );

  if (poResult.rows.length === 0) {
    await storeResult(invoiceId, poNumber, "MISMATCH", true, false, false);
    return {
      invoice_id: invoiceId,
      matching_status: "MISMATCH",
      flags: { missing_po: true }
    };
  }

  const po = poResult.rows[0];

  // 4️⃣ Simple total comparison (2-way matching for now)
  let priceVarianceFlag = false;
  let quantityVarianceFlag = false;

  const tolerance = 0.02; // 2%

  const variance = Math.abs(invoiceTotal - po.total_amount) / po.total_amount;

  if (variance > tolerance) {
    priceVarianceFlag = true;
  }

  // 5️⃣ Determine status
  let matchingStatus = "MATCHED";

  if (priceVarianceFlag) {
    matchingStatus = "PARTIAL_MATCH";
  }

  // 6️⃣ Store result
  await storeResult(
    invoiceId,
    poNumber,
    matchingStatus,
    false,
    priceVarianceFlag,
    false
  );

  return {
    invoice_id: invoiceId,
    matching_status: matchingStatus,
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
