import pool from "../db.js";
import { runApproval } from "../modules/step6-approval/services/approvalService.js";

export async function execute(context) {

  const { invoice_id, organization_id } = context;

  // 🔵 Validate state (tenant isolated)
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

  // 🔵 Phase 4 — pass full context to service layer
  const approvalResult = await runApproval(context);

  // Worker returns deterministic signal only
  return approvalResult;
}