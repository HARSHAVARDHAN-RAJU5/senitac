import db from "../../../db.js";

export const evaluateTax = async (invoice) => {

  // 1️⃣ Get GST from invoice
  const gst =
    invoice.tax_id ||
    invoice.supplier_gst ||
    null;

  if (!gst) {
    return { status: "FAIL", reason: "GST missing for tax evaluation" };
  }

  // 2️⃣ Get vendor country from vendor_master
  const vendorRes = await db.query(
    "SELECT country_code FROM vendor_master WHERE tax_id = $1",
    [gst]
  );

  if (!vendorRes.rows.length) {
    return { status: "FAIL", reason: "Vendor not found for tax evaluation" };
  }

  const countryCode = vendorRes.rows[0].country_code;

  // 3️⃣ Get tax rule
  const ruleRes = await db.query(
    `SELECT expected_rate 
     FROM tax_rules_master
     WHERE country_code = $1
     AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [countryCode]
  );

  if (!ruleRes.rows.length) {
    return { status: "FAIL", reason: "No tax rule found" };
  }

  const expectedRate = parseFloat(ruleRes.rows[0].expected_rate);

  const invoiceTotal =
    invoice.invoice_total ||
    invoice.invoice_amount ||
    0;

  const taxAmount =
    invoice.tax_amount ||
    0;

  const expectedTax = invoiceTotal * expectedRate;
  const difference = Math.abs(expectedTax - taxAmount);

  if (difference < 1) {
    return { status: "PASS" };
  }

  return { status: "FAIL", reason: "Tax mismatch" };
};
