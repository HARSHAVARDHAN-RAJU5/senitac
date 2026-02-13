import db from "../../db.js";

export const evaluateTax = async (invoice) => {

  const ruleRes = await db.query(
    `SELECT expected_rate 
     FROM tax_rules_master
     WHERE country_code = $1
     AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [invoice.data.vendor_country]
  );

  if (!ruleRes.rows.length) {
    return { status: "FAIL", reason: "No tax rule found" };
  }

  const expectedRate = parseFloat(ruleRes.rows[0].expected_rate);

  const expectedTax = invoice.data.invoice_total * expectedRate;
  const difference = Math.abs(expectedTax - invoice.data.tax_amount);

  if (difference < 1) {
    return { status: "PASS" };
  }

  return { status: "FAIL", reason: "Tax mismatch" };
};
