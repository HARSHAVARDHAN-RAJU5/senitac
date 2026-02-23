import db from "../../../db.js";

function normalizeCompare(value) {
  if (!value) return null;
  return value.trim().toUpperCase();
}

function toNumber(value) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

async function validateVendor(context) {

  const { invoice_id, organization_id } = context;

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

  const subtotal = toNumber(extracted.subtotal);
  const tax = toNumber(extracted.tax);
  const total = toNumber(extracted.total);

  // 🔥 GOVERNANCE RULE: arithmetic integrity
  if (subtotal && total) {
    const calculated = subtotal + tax;
    if (Math.abs(calculated - total) > 1) {
      return {
        success: true,
        status: "EXCEPTION_REVIEW",
        reason: "Financial mismatch: subtotal + tax does not equal total"
      };
    }
  }

  const supplierName = normalizeCompare(
    extracted.supplier_name || extracted.vendor_name
  );

  const taxId =
    extracted.tax_id ||
    extracted.supplier_gst ||
    extracted.gstin ||
    null;

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

  let overallStatus = "VALID";

  if (normalizeCompare(vendor.legal_name) !== supplierName) {
    overallStatus = "REVIEW_REQUIRED";
  }

  if (vendor.tax_id !== taxId) {
    overallStatus = "BLOCKED";
  }

  await db.query(
    `
    INSERT INTO invoice_validation_results
      (invoice_id, organization_id, vendor_id,
       overall_status, validated_at)
    VALUES ($1,$2,$3,$4,NOW())
    ON CONFLICT (invoice_id, organization_id)
    DO UPDATE SET
      overall_status = EXCLUDED.overall_status,
      validated_at = NOW()
    `,
    [
      invoice_id,
      organization_id,
      vendor.vendor_id,
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