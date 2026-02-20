import db from "../../../db.js";
import { determineApprovalLevel } from "./approvalRules.js";

export async function runApproval(invoice_id, organization_id) {

  // Fetch invoice data (tenant isolated)
  const invoiceRes = await db.query(
    `
    SELECT data
    FROM invoice_extracted_data
    WHERE invoice_id = $1
    AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!invoiceRes.rows.length) {
    return {
      success: false,
      reason: "Invoice data not found"
    };
  }

  const invoiceData = invoiceRes.rows[0].data;
  const invoiceTotal = parseFloat(invoiceData.total_amount || 0);

  if (!invoiceTotal) {
    return {
      success: false,
      reason: "Invoice total missing"
    };
  }

  // Determine dynamic approval level
  const approvalLevel = await determineApprovalLevel(
    invoiceTotal,
    organization_id
  );

  // Insert / Update workflow record (multi-tenant safe)
  await db.query(
    `
    INSERT INTO invoice_approval_workflow
    (invoice_id, organization_id, assigned_to, approval_level, approval_status, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (invoice_id, organization_id)
    DO UPDATE SET
      assigned_to = EXCLUDED.assigned_to,
      approval_level = EXCLUDED.approval_level,
      approval_status = EXCLUDED.approval_status
    `,
    [
      invoice_id,
      organization_id,
      approvalLevel,
      approvalLevel,
      "APPROVED"
    ]
  );

  return {
    success: true,
    status: "APPROVED",
    approval_level: approvalLevel
  };
}