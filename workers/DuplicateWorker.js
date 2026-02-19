import pool from "../db.js";

export async function execute(invoice_id) {

  console.log("Running duplicate check for:", invoice_id);

  // Get extracted JSON
  const result = await pool.query(
    `SELECT data
     FROM invoice_extracted_data
     WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!result.rows.length) {
    return {
      outcome: "DATA_MISSING",
      reason: "No extracted data found"
    };
  }

  const data = result.rows[0].data;

  const invoice_number = data.invoice_number;
  const vendor_name = data.vendor_name;
  const total_amount = data.total_amount;

  if (!invoice_number || !vendor_name || !total_amount) {
    return {
      outcome: "DATA_MISSING",
      reason: "Required fields missing in extracted JSON"
    };
  }

  // Check duplicates using JSON fields
  const duplicateCheck = await pool.query(
    `SELECT COUNT(*)
     FROM invoice_extracted_data
     WHERE data->>'invoice_number' = $1
       AND data->>'vendor_name' = $2
       AND (data->>'total_amount')::numeric = $3
       AND invoice_id <> $4`,
    [invoice_number, vendor_name, total_amount, invoice_id]
  );

  const count = parseInt(duplicateCheck.rows[0].count);

  if (count === 0) {
    return { outcome: "NO_DUPLICATE" };
  }

  if (count === 1) {
    return { outcome: "POTENTIAL_DUPLICATE" };
  }

  return { outcome: "DUPLICATE_CONFIRMED" };
}
