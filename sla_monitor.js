import pool from "./db.js";

console.log("SLA Monitor started...");

setInterval(async () => {
  try {

    const overdue = await pool.query(
      `SELECT invoice_id
       FROM invoice_state_machine
       WHERE current_state = 'WAITING_INFO'
         AND waiting_deadline IS NOT NULL
         AND waiting_deadline < NOW()`
    );

    if (overdue.rows.length === 0) {
      return;
    }

    for (const row of overdue.rows) {

      await pool.query(
        `UPDATE invoice_state_machine
         SET current_state = 'BLOCKED',
             waiting_since = NULL,
             waiting_deadline = NULL,
             waiting_reason = NULL,
             last_updated = NOW()
         WHERE invoice_id = $1`,
        [row.invoice_id]
      );

      console.log("Auto-blocked due to SLA:", row.invoice_id);
    }

  } catch (err) {
    console.error("SLA Monitor Error:", err.message);
  }
}, 60000);
