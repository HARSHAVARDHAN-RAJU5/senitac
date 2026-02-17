import pool from "./db.js";

console.log("SLA Monitor started...");

setInterval(async () => {
  try {

    const overdue = await pool.query(
      `
      SELECT invoice_id
      FROM invoice_state_machine
      WHERE current_state = 'WAITING_INFO'
        AND waiting_reason = 'BANK_VERIFICATION_REQUIRED'
        AND waiting_deadline IS NOT NULL
        AND waiting_deadline < NOW()
      `
    );

    if (overdue.rows.length === 0) {
      return;
    }

    for (const row of overdue.rows) {
      await pool.query(
        `
        UPDATE invoice_state_machine
        SET current_state = 'EXCEPTION_REVIEW',
            waiting_since = NULL,
            waiting_deadline = NULL,
            waiting_reason = NULL,
            last_updated = NOW()
        WHERE invoice_id = $1
        `,
        [row.invoice_id]
      );

      await pool.query(
        `
        INSERT INTO audit_event_log
        (invoice_id, event_type, severity, description)
        VALUES ($1,$2,$3,$4)
        `,
        [
          row.invoice_id,
          "BANK_VERIFICATION_SLA_EXPIRED",
          "HIGH",
          "Vendor did not confirm bank change within SLA. Escalated for manual review."
        ]
      );

      console.log("Escalated due to bank verification SLA:", row.invoice_id);
    }

  } catch (err) {
    console.error("SLA Monitor Error:", err.message);
  }

}, 60000);
