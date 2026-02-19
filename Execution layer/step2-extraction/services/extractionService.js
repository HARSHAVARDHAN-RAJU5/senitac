import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js";
import pool from "../../../db.js";

function normalizeText(value) {
  if (!value) return null;

  return value
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .trim();
}

function extractFieldByLabel(text, label) {
  const regex = new RegExp(`${label}\\s*:\\s*(.+)`, "i");
  const match = text.match(regex);
  return match ? normalizeText(match[1]) : null;
}

async function extractAndStructure(invoice_id) {

  const invoiceRes = await pool.query(
    `SELECT file_path FROM invoices WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!invoiceRes.rows.length) {
    return { success: false, reason: "FILE_NOT_FOUND" };
  }

  const filePath = invoiceRes.rows[0].file_path;

  if (!fs.existsSync(filePath)) {
    return { success: false, reason: "FILE_MISSING_ON_DISK" };
  }

  const buffer = fs.readFileSync(filePath);
  const pdfData = await pdf(buffer);
  const text = pdfData.text;

  // --- Precise Field Extraction ---
  const invoice_number = extractFieldByLabel(text, "Invoice Number");
  const vendor_name = extractFieldByLabel(text, "Vendor Name");
  const po_number = extractFieldByLabel(text, "PO Number");

  const gstinMatch =
    text.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]/);

  const totalMatch =
    text.match(/Total Amount\s*:\s*([\d,]+(\.\d+)?)/i);

  const invoiceDateMatch =
    text.match(/\b\d{4}\-\d{2}\-\d{2}\b/);

  const structured = {
    invoice_number,
    vendor_name,
    gstin: gstinMatch?.[0] || null,
    total_amount: totalMatch
      ? parseFloat(totalMatch[1].replace(/,/g, ""))
      : null,
    invoice_date: invoiceDateMatch?.[0] || null,
    po_number,
    extraction_type: "regex"
  };

  if (!structured.invoice_number || !structured.total_amount) {
    return { success: false, reason: "STRUCTURED_FIELDS_MISSING" };
  }

  await pool.query(
    `INSERT INTO invoice_extracted_data 
     (invoice_id, data, extraction_status, extracted_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (invoice_id)
     DO UPDATE SET 
       data = EXCLUDED.data,
       extraction_status = EXCLUDED.extraction_status,
       extracted_at = NOW()`,
    [invoice_id, structured, "SUCCESS"]
  );

  return {
    success: true,
    outcome: "EXTRACTION_SUCCESS"
  };
}

export default extractAndStructure;
