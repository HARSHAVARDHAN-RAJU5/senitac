import db from "../../../db.js";

export const evaluateTax = async (invoice) => {

  const gst = invoice.tax_id || invoice.supplier_gst || null;
  if (!gst) return { status: "FAIL" };

  const vendorRes = await db.query(
    "SELECT country_code FROM vendor_master WHERE tax_id = $1",
    [gst]
  );

  if (!vendorRes.rows.length) return { status: "FAIL" };

  const countryCode = vendorRes.rows[0].country_code;

  const ruleRes = await db.query(
    `
    SELECT expected_rate
    FROM tax_rules_master
    WHERE country_code = $1
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    ORDER BY effective_from DESC
    LIMIT 1
    `,
    [countryCode]
  );

  if (!ruleRes.rows.length) return { status: "FAIL" };

  const expectedRate = parseFloat(ruleRes.rows[0].expected_rate);

  const invoiceTotal = parseFloat(invoice.total_amount || 0);
  const taxAmount = parseFloat(invoice.tax_amount || 0);

  const expectedTax = invoiceTotal * expectedRate;
  const difference = Math.abs(expectedTax - taxAmount);

  return difference < 1
    ? { status: "PASS" }
    : { status: "FAIL" };
};
