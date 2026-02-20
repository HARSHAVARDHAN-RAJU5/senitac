import pool from "../db.js";
import { runApproval } from "../Execution layer/step6-approval/services/approvalService.js";

export async function execute(invoice_id, organization_id) {

  // Validate state (tenant isolated)
  const stateCheck = await pool.query(
    `
    SELECT current_state
    FROM invoice_state_machine
    WHERE invoice_id = $1
    AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  if (stateCheck.rows[0].current_state !== "PENDING_APPROVAL") {
    throw new Error("Invalid state for ApprovalWorker");
  }

  // Run approval service (tenant-aware)
  const approvalResult = await runApproval(invoice_id, organization_id);

  // Worker returns signals only
  return approvalResult;
}