import fs from "fs";
import pool from "../../db.js";
import Tesseract from "tesseract.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

function calculateConfidence(text) {
  if (!text || text.trim().length === 0) return 0.0;

  const lengthScore = Math.min(text.length / 2000, 1);
  const keywordBoost =
    /invoice|total|amount|gst|tax|bill/i.test(text) ? 0.2 : 0;

  return Math.min(lengthScore + keywordBoost, 1.0);
}

async function extractPdfText(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return fullText;
}

export async function extractInvoice(invoice_id) {
  const res = await pool.query(
    "SELECT file_path, mime_type FROM invoices WHERE invoice_id = $1",
    [invoice_id]
  );

  if (res.rows.length === 0) {
    throw new Error("Invoice not found in STEP 1");
  }

  const { file_path, mime_type } = res.rows[0];

  if (!fs.existsSync(file_path)) {
    throw new Error("Invoice file missing on disk");
  }

  let extractedText = "";
  let extractionType = "";

  if (mime_type === "application/pdf") {
    extractedText = await extractPdfText(file_path);
    extractionType = "pdf";
  } else if (mime_type.startsWith("image/")) {
    const result = await Tesseract.recognize(file_path, "eng");
    extractedText = result.data.text;
    extractionType = "image";
  } else {
    throw new Error("Unsupported file type");
  }

  const confidence = calculateConfidence(extractedText);

  const extractedData = {
    extraction_type: extractionType,
    text: extractedText,
    confidence,
  };

  await pool.query(
    `
    INSERT INTO invoice_extracted_data (invoice_id, data, extraction_status)
    VALUES ($1, $2, $3)
    ON CONFLICT (invoice_id)
    DO UPDATE SET
      data = EXCLUDED.data,
      extraction_status = EXCLUDED.extraction_status,
      extracted_at = now()
    `,
    [invoice_id, extractedData, "SUCCESS"]
  );

  return extractedData;
}
