import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import pool from "../../../db.js";

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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
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

    await client.query(
      `
      INSERT INTO invoice_state_machine (invoice_id, current_state)
      VALUES ($1, $2)
      `,
      [invoiceId, "RECEIVED"]
    );

    await client.query("COMMIT");

    return {
      invoice_id: invoiceId,
      status: "RECEIVED",
      received_at: receivedAt.toISOString()
    };

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
