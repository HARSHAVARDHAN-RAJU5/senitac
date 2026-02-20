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
  organization_id,
  extraMetadata = {}
}) {

  if (!file || !file.buffer) {
    throw new Error("Invalid file input");
  }

  if (!organization_id) {
    throw new Error("organization_id is required");
  }

  const invoiceId = `inv_${randomUUID()}`;

  // Org isolated storage path
  const invoiceDir = path.join(
    __dirname,
    "..",
    "storage",
    "invoices",
    organization_id,
    invoiceId
  );

  fs.mkdirSync(invoiceDir, { recursive: true });

  const originalFilePath = path.join(invoiceDir, file.originalname);
  fs.writeFileSync(originalFilePath, file.buffer);

  const receivedAt = new Date();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ✅ Multi-tenant safe insert
    await client.query(
      `
      INSERT INTO invoices (
        invoice_id,
        organization_id,
        source,
        received_from,
        original_filename,
        file_path,
        mime_type,
        file_size_bytes,
        status,
        received_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        invoiceId,
        organization_id,
        source,
        receivedFrom,
        file.originalname,
        originalFilePath,
        file.mimetype,
        file.size,
        "RECEIVED",
        receivedAt
      ]
    );

    // ✅ Multi-tenant state machine
    await client.query(
      `
      INSERT INTO invoice_state_machine (
        invoice_id,
        organization_id,
        current_state
      )
      VALUES ($1, $2, $3)
      `,
      [invoiceId, organization_id, "RECEIVED"]
    );

    await client.query("COMMIT");

    return {
      invoice_id: invoiceId,
      organization_id,
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