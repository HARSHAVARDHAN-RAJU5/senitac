import db from "../../../db.js";

async function validateVendor(invoiceId) {

  const extractedResult = await db.query(
    "SELECT data, extraction_status FROM invoice_extracted_data WHERE invoice_id = $1",
    [invoiceId]
  );

  if (!extractedResult.rows.length) {
    return {
      success: false,
      status: "BLOCKED",
      reason: "No extracted data found"
    };
  }

  if (extractedResult.rows[0].extraction_status !== "SUCCESS") {
    return {
      success: false,
      status: "REVIEW_REQUIRED",
      reason: "Extraction not successful"
    };
  }

  const extracted = extractedResult.rows[0].data || {};

  let supplierName = null;
  let taxId = null;
  let bankAccount = null;

  if (extracted.supplier_name || extracted.vendor_name || extracted.tax_id) {

    supplierName =
      extracted.supplier_name ||
      extracted.vendor_name ||
      null;

    taxId =
      extracted.tax_id ||
      extracted.supplier_gst ||
      null;

    bankAccount =
      extracted.bank_account ||
      null;

    if (supplierName) supplierName = supplierName.trim().toUpperCase();
    if (taxId) taxId = taxId.trim();
    if (bankAccount) bankAccount = bankAccount.trim();

  } else {

    const rawText = extracted.text || "";

    const supplierMatch = rawText.match(/Vendor Details:\s*(.+)/i);
    const gstMatch = rawText.match(/GSTIN:\s*([A-Z0-9]+)/i);
    const bankMatch = rawText.match(/Bank Account:\s*([0-9]+)/i);

    supplierName = supplierMatch?.[1]?.trim().toUpperCase() || null;
    taxId = gstMatch?.[1]?.trim() || null;
    bankAccount = bankMatch?.[1]?.trim() || null;
  }

  if (!taxId) {
    return {
      success: false,
      status: "REVIEW_REQUIRED",
      reason: "GST not found in invoice"
    };
  }

  const vendorResult = await db.query(
    "SELECT * FROM vendor_master WHERE tax_id = $1",
    [taxId]
  );

  if (!vendorResult.rows.length) {
    return {
      success: false,
      status: "REVIEW_REQUIRED",
      reason: "Vendor not found"
    };
  }

  const vendor = vendorResult.rows[0];

  let legalStatus = "MATCH";
  let taxStatus = "MATCH";
  let bankStatus = "MATCH";

  if (vendor.legal_name.toUpperCase() !== supplierName) {
    legalStatus = "MISMATCH";
  }

  if (vendor.tax_id !== taxId) {
    taxStatus = "MISMATCH";
  }

  if (bankAccount && vendor.bank_account !== bankAccount) {
    bankStatus = "MISMATCH";
  }

  // 🔹 ONLY tax mismatch blocks
  let overallStatus = "VALID";

  if (taxStatus === "MISMATCH") {
    overallStatus = "BLOCKED";
  } else if (legalStatus === "MISMATCH") {
    overallStatus = "REVIEW_REQUIRED";
  }

  await db.query(
    `INSERT INTO invoice_validation_results 
    (invoice_id, vendor_id, legal_status, tax_status, bank_status, overall_status, validated_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (invoice_id) DO UPDATE SET
      legal_status = EXCLUDED.legal_status,
      tax_status = EXCLUDED.tax_status,
      bank_status = EXCLUDED.bank_status,
      overall_status = EXCLUDED.overall_status,
      validated_at = NOW()`,
    [
      invoiceId,
      vendor.vendor_id,
      legalStatus,
      taxStatus,
      bankStatus,
      overallStatus
    ]
  );

  return {
    success: true,
    status: overallStatus,
    data: {
      vendor_id: vendor.vendor_id
    }
  };
}

export default validateVendor;
