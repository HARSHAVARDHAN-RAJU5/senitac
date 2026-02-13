import pool from "../db.js";
import { runApproval } from "../step6-approval/services/approvalService.js";

export async function execute(invoice_id) {
  const stateCheck = await pool.query(
    `
      SELECT current_state
      FROM invoice_state_machine
      WHERE invoice_id = $1
    `,
    [invoice_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  const currentState = stateCheck.rows[0].current_state;

  if (currentState !== "PENDING_APPROVAL") {
    throw new Error("Invalid state for ApprovalWorker");
  }

  const approvalResult = await runApproval(invoice_id);

  if (!approvalResult || approvalResult.success !== true) {
    return { nextState: "BLOCKED" };
  }

  return { nextState: "APPROVED" };
}
