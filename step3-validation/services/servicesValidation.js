const db = require("../../db");

async function validateVendor(invoiceId) {

  // 1️⃣ Get extracted data
  const extractedResult = await db.query(
    "SELECT data, extraction_status FROM invoice_extracted_data WHERE invoice_id = $1",
    [invoiceId]
  );

  if (extractedResult.rows.length === 0) {
    throw new Error("No extracted data found");
  }

  if (extractedResult.rows[0].extraction_status !== "SUCCESS") {
    return { overall_status: "REVIEW_REQUIRED" };
  }

  const extracted = extractedResult.rows[0].data;

  const supplierName = extracted.supplier_name?.trim().toUpperCase();
  const taxId = extracted.tax_id?.trim();
  const bankAccount = extracted.bank_account?.trim();

  // 2️⃣ Lookup vendor by tax_id
  const vendorResult = await db.query(
    "SELECT * FROM vendor_master WHERE tax_id = $1",
    [taxId]
  );

  if (vendorResult.rows.length === 0) {
    return {
      invoice_id: invoiceId,
      overall_status: "REVIEW_REQUIRED",
      reason: "Vendor not found"
    };
  }

  const vendor = vendorResult.rows[0];

  // 3️⃣ Validation checks
  let legalStatus = "MATCH";
  let taxStatus = "MATCH";
  let bankStatus = "MATCH";

  if (vendor.legal_name.toUpperCase() !== supplierName) {
    legalStatus = "MISMATCH";
  }

  if (vendor.tax_id !== taxId) {
    taxStatus = "MISMATCH";
  }

  if (vendor.bank_account !== bankAccount) {
    bankStatus = "MISMATCH";
  }

  // 4️⃣ Overall decision
  let overallStatus = "VALID";

  if (taxStatus === "MISMATCH" || bankStatus === "MISMATCH") {
    overallStatus = "BLOCKED";
  } else if (legalStatus === "MISMATCH") {
    overallStatus = "REVIEW_REQUIRED";
  }

  // 5️⃣ Store validation result
  await db.query(
    `INSERT INTO invoice_validation_results 
    (invoice_id, vendor_id, legal_status, tax_status, bank_status, overall_status, validated_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
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
    invoice_id: invoiceId,
    vendor_id: vendor.vendor_id,
    overall_status: overallStatus
  };
}

module.exports = validateVendor;
