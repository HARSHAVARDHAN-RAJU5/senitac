import pool from "../db.js";

export async function logAgentAction({
  invoice_id,
  organization_id,
  agent_name,
  state_name,
  action,
  input = null,
  output = null,
  success = true,
  error_message = null,
  attempt_number = 0
}) {
  await pool.query(
    `
    INSERT INTO agent_action_log
    (invoice_id, organization_id, agent_name, state_name,
     action, input, output, success, error_message, attempt_number)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `,
    [
      invoice_id,
      organization_id,
      agent_name,
      state_name,
      action,
      input,
      output,
      success,
      error_message,
      attempt_number
    ]
  );
}
