import fs from "fs";
import axios from "axios";
import pool from "../../../db.js";

import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
const { getDocument } = pdfjs;

async function extractAndStructure(context) {

  const { invoice_id, organization_id } = context;

  if (!invoice_id || !organization_id) {
    throw new Error("Extraction requires invoice_id and organization_id");
  }

  const invoiceRes = await pool.query(
    `
    SELECT file_path
    FROM invoices
    WHERE invoice_id = $1
      AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!invoiceRes.rows.length) {
    return { success: false, failure_type: "FILE_NOT_FOUND" };
  }

  const filePath = invoiceRes.rows[0].file_path;

  if (!fs.existsSync(filePath)) {
    return { success: false, failure_type: "FILE_MISSING_ON_DISK" };
  }

  const buffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(buffer);

  const loadingTask = getDocument({ data: uint8Array });
  const pdfDocument = await loadingTask.promise;

  let text = "";

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    text += "\n" + pageText;
  }

  const prompt = `
You are an AI invoice extraction engine.

Extract the following fields from the invoice text below.
Return ONLY valid JSON. No explanation.

Fields:
- invoice_number
- vendor_name
- gstin
- subtotal (number, before tax)
- tax (number)
- total_amount (number, after tax)
- invoice_date
- due_date
- po_number

If any numeric value contains currency symbols, remove them.
If any field is missing, return null.

Invoice Text:
${text}
`;

  const response = await axios.post(
    "http://127.0.0.1:11434/api/generate",
    {
      model: "llama3",
      prompt,
      stream: false
    }
  );

  let structured;

  try {
    structured = JSON.parse(response.data.response);
  } catch (err) {
    return { success: false, failure_type: "AI_PARSE_ERROR" };
  }

  if (!structured.invoice_number || !structured.total_amount) {
    return { success: false, failure_type: "STRUCTURED_FIELDS_MISSING" };
  }

  // Normalize numeric fields
  structured.total_amount = structured.total_amount
    ? Number(structured.total_amount)
    : null;

  structured.subtotal = structured.subtotal
    ? Number(structured.subtotal)
    : null;

  structured.tax = structured.tax
    ? Number(structured.tax)
    : null;

  // Fallback derivation logic (GST 18% assumption if missing)
  if (structured.total_amount && !structured.subtotal && !structured.tax) {
    const derivedSubtotal = structured.total_amount / 1.18;
    structured.subtotal = Math.round(derivedSubtotal);
    structured.tax = structured.total_amount - structured.subtotal;
  }

  if (structured.subtotal && structured.tax && !structured.total_amount) {
    structured.total_amount = structured.subtotal + structured.tax;
  }

  await pool.query(
    `
    INSERT INTO invoice_extracted_data
      (invoice_id, organization_id, data, extraction_status, extracted_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (invoice_id, organization_id)
    DO UPDATE SET
      data = EXCLUDED.data,
      extraction_status = EXCLUDED.extraction_status,
      extracted_at = NOW()
    `,
    [invoice_id, organization_id, structured, "SUCCESS"]
  );

  return {
    success: true,
    outcome: "AI_EXTRACTION_SUCCESS"
  };
}

export default extractAndStructure;