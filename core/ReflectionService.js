import pool from "../db.js";

export async function reflect(context, currentState) {

  const { invoice_id, organization_id } = context;

  const history = await pool.query(
    `
    SELECT action, output, error_message, success
    FROM agent_action_log
    WHERE invoice_id = $1
      AND organization_id = $2
    ORDER BY created_at DESC
    LIMIT 5
    `,
    [invoice_id, organization_id]
  );

  if (!history.rows.length) {
    return null;
  }

  const failures = history.rows.filter(r => r.success === false);

  if (failures.length >= 2) {

    // Example adaptive rule:
    if (currentState === "MATCHING") {
      return {
        overrideState: "EXCEPTION_REVIEW",
        reason: "Repeated matching failure"
      };
    }

    if (currentState === "VALIDATING") {
      return {
        overrideState: "WAITING_INFO",
        reason: "Repeated validation failure"
      };
    }
  }

  return null;
}