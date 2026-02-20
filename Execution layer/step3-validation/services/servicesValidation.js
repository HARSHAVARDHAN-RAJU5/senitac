import db from "../../../db.js";

function normalizeCompare(value) {
  if (!value) return null;
  return value.trim().toUpperCase();
}

async function validateVendor(context) {

  const { invoice_id, organization_id } = context;

  if (!invoice_id || !organization_id) {
    throw new Error("validateVendor requires invoice_id and organization_id");
  }

  const extractedResult = await db.query(
    `
    SELECT data, extraction_status
    FROM invoice_extracted_data
    WHERE invoice_id = $1
      AND organization_id = $2
    `,
    [invoice_id, organization_id]
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

  const supplierName = normalizeCompare(
    extracted.supplier_name || extracted.vendor_name
  );

  const taxId =
    extracted.tax_id ||
    extracted.supplier_gst ||
    extracted.gstin ||
    null;

  const bankAccount =
    extracted.bank_account || null;

  if (!taxId) {
    return {
      success: false,
      status: "REVIEW_REQUIRED",
      reason: "GST not found in invoice"
    };
  }

  const vendorResult = await db.query(
    `
    SELECT *
    FROM vendor_master
    WHERE tax_id = $1
      AND organization_id = $2
    `,
    [taxId, organization_id]
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

  if (
    supplierName &&
    normalizeCompare(vendor.legal_name) !== supplierName
  ) {
    legalStatus = "MISMATCH";
  }

  if (vendor.tax_id !== taxId) {
    taxStatus = "MISMATCH";
  }

  if (
    bankAccount &&
    vendor.bank_account !== bankAccount
  ) {
    bankStatus = "MISMATCH";
  }

  let overallStatus = "VALID";

  if (taxStatus === "MISMATCH") {
    overallStatus = "BLOCKED";
  } else if (legalStatus === "MISMATCH") {
    overallStatus = "REVIEW_REQUIRED";
  }

  await db.query(
    `
    INSERT INTO invoice_validation_results
      (invoice_id, organization_id, vendor_id,
       legal_status, tax_status, bank_status,
       overall_status, validated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (invoice_id, organization_id)
    DO UPDATE SET
      legal_status = EXCLUDED.legal_status,
      tax_status = EXCLUDED.tax_status,
      bank_status = EXCLUDED.bank_status,
      overall_status = EXCLUDED.overall_status,
      validated_at = NOW()
    `,
    [
      invoice_id,
      organization_id,
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
    data: { vendor_id: vendor.vendor_id }
  };
}

export default validateVendor;