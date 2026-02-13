import db from "../../db.js";

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

  const extracted = extractedResult.rows[0].data;

  const supplierName = extracted.supplier_name?.trim().toUpperCase();
  const taxId = extracted.tax_id?.trim();
  const bankAccount = extracted.bank_account?.trim();

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

  if (vendor.bank_account !== bankAccount) {
    bankStatus = "MISMATCH";
  }

  let overallStatus = "VALID";

  if (taxStatus === "MISMATCH" || bankStatus === "MISMATCH") {
    overallStatus = "BLOCKED";
  } else if (legalStatus === "MISMATCH") {
    overallStatus = "REVIEW_REQUIRED";
  }

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
    success: true,
    status: overallStatus,
    data: {
      vendor_id: vendor.vendor_id
    }
  };
}

export default validateVendor;
