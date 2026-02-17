import pool from "../db.js";

export async function execute(invoice_id) {
  const invoiceRes = await pool.query(
    `SELECT data
     FROM invoice_extracted_data
     WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!invoiceRes.rows.length) {
    return {
      success: false,
      nextState: "BLOCKED",
      reason: "Extraction data missing"
    };
  }

  const invoiceData = invoiceRes.rows[0].data;

  const vendor_id = invoiceData.vendor_id;
  const invoice_number = invoiceData.invoice_number;
  const invoice_total = invoiceData.invoice_total;

  const duplicateRes = await pool.query(
    `SELECT invoice_id,
            data->>'invoice_total' AS invoice_total
     FROM invoice_extracted_data
     WHERE data->>'vendor_id' = $1
       AND data->>'invoice_number' = $2
       AND invoice_id != $3`,
    [vendor_id, invoice_number, invoice_id]
  );

  if (duplicateRes.rows.length === 0) {
    return {
      success: true,
      nextState: "DUPLICATE_CHECK"
    };
  }

  const strictMatch = duplicateRes.rows.find(
    row => Number(row.invoice_total) === Number(invoice_total)
  );

  if (strictMatch) {
    return {
      success: false,
      nextState: "BLOCKED",
      reason: "DUPLICATE_CONFIRMED"
    };
  }

  return {
    success: false,
    nextState: "BLOCKED",
    reason: "POTENTIAL_DUPLICATE"
  };
}
