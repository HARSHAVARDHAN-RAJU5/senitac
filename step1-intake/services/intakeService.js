import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { pool } from "../../db.js";   

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function handleInvoiceIntake({
  file,
  source,
  receivedFrom,
  extraMetadata = {}
}) {
  if (!file || !file.buffer) {
    throw new Error("Invalid file input");
  }

  const invoiceId = `inv_${randomUUID()}`;

  const invoiceDir = path.join(
    __dirname,
    "..",
    "storage",
    "invoices",
    invoiceId
  );

  fs.mkdirSync(invoiceDir, { recursive: true });

  const originalFilePath = path.join(invoiceDir, file.originalname);
  fs.writeFileSync(originalFilePath, file.buffer);

  const receivedAt = new Date();

  // console.log("ABOUT TO INSERT INTO DB:", {
  //   invoiceId,
  //   source,
  //   receivedFrom,
  //   database: "senitac_ap",
  //   port: 5433
  // });

  try {
    const result = await pool.query(
      `
      INSERT INTO invoices (
        invoice_id,
        source,
        received_from,
        original_filename,
        file_path,
        mime_type,
        file_size_bytes,
        status,
        received_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING invoice_id
      `,
      [
        invoiceId,
        source,
        receivedFrom,
        file.originalname,
        originalFilePath,
        file.mimetype,
        file.size,
        "received",
        receivedAt
      ]
    );

    // console.log("DB INSERT SUCCESS:", result.rows);

    return {
      invoice_id: invoiceId,
      status: "received",
      received_at: receivedAt.toISOString()
    };
  } catch (err) {
    console.error(" DB INSERT FAILED:", err);
    throw err;
  }
}
