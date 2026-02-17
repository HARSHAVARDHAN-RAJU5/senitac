import pool from "./db.js";
import { createClient } from "redis";

const redis = createClient({
  url: "redis://127.0.0.1:6379"
});

await redis.connect();

console.log("Universal SLA Monitor started...");

setInterval(async () => {

  try {

    const overdue = await pool.query(
      `
      SELECT invoice_id, waiting_reason
      FROM invoice_state_machine
      WHERE current_state = 'WAITING_INFO'
        AND waiting_deadline IS NOT NULL
        AND waiting_deadline < NOW()
      `
    );

    if (!overdue.rows.length) return;

    for (const row of overdue.rows) {

      const { invoice_id, waiting_reason } = row;

      await pool.query(
        `
        UPDATE invoice_state_machine
        SET current_state = 'BLOCKED',
            waiting_since = NULL,
            waiting_deadline = NULL,
            waiting_reason = NULL,
            verification_token = NULL,
            token_expiry = NULL,
            last_updated = NOW()
        WHERE invoice_id = $1
        `,
        [invoice_id]
      );

      await pool.query(
        `
        INSERT INTO audit_event_log
        (invoice_id, event_type, severity, description)
        VALUES ($1,$2,$3,$4)
        `,
        [
          invoice_id,
          "WAITING_INFO_TIMEOUT",
          "HIGH",
          `SLA expired (10 days) for reason: ${waiting_reason}. Invoice blocked.`
        ]
      );

      // Optional re-emit for final logging / orchestrator awareness
      await redis.xAdd(
        "invoice_events",
        "*",
        { invoice_id }
      );

      console.log("Blocked due to SLA expiry:", invoice_id);
    }

  } catch (err) {
    console.error("SLA Monitor Error:", err.message);
  }

}, 60000); 
