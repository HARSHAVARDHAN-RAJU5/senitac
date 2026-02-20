import pool from "../db.js";

export async function execute(invoice_id, organization_id) {

  if (!invoice_id || !organization_id) {
    throw new Error("DuplicateCheckWorker requires invoice_id and organization_id");
  }

  console.log("Running duplicate check for:", invoice_id);

  // Tenant-isolated extracted JSON fetch
  const result = await pool.query(
    `
    SELECT data
    FROM invoice_extracted_data
    WHERE invoice_id = $1
    AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!result.rows.length) {
    return {
      success: false,
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
      success: false,
      outcome: "DATA_MISSING",
      reason: "Required fields missing in extracted JSON"
    };
  }

  // Tenant-isolated duplicate check
  const duplicateCheck = await pool.query(
    `
    SELECT COUNT(*)
    FROM invoice_extracted_data
    WHERE organization_id = $1
      AND data->>'invoice_number' = $2
      AND data->>'vendor_name' = $3
      AND (data->>'total_amount')::numeric = $4
      AND invoice_id <> $5
    `,
    [
      organization_id,
      invoice_number,
      vendor_name,
      total_amount,
      invoice_id
    ]
  );

  const count = parseInt(duplicateCheck.rows[0].count, 10);

  if (count === 0) {
    return {
      success: true,
      outcome: "NO_DUPLICATE"
    };
  }

  if (count === 1) {
    return {
      success: true,
      outcome: "POTENTIAL_DUPLICATE"
    };
  }

  return {
    success: true,
    outcome: "DUPLICATE_CONFIRMED"
  };
}