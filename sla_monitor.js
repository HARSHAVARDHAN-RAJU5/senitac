import pool from "./db.js";
import { createClient } from "redis";

const redis = createClient({
  url: "redis://127.0.0.1:6379"
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});

await redis.connect();

console.log("Unified SLA Governance Monitor started...");

setInterval(async () => {
  try {

    // Load all active SLA rules
    const slaRules = await pool.query(`
      SELECT organization_id, state_name, sla_days, escalation_level
      FROM sla_config
      WHERE is_active = TRUE
    `);

    if (!slaRules.rows.length) return;

    for (const rule of slaRules.rows) {

      const { organization_id, state_name, sla_days, escalation_level } = rule;

      if (state_name === "PAYMENT_READY" && escalation_level === "EXECUTE_PAYMENT") {

        const duePayments = await pool.query(
          `
          SELECT p.payment_id, p.invoice_id
          FROM invoice_payment_schedule p
          JOIN invoice_state_machine s
            ON p.invoice_id = s.invoice_id
           AND p.organization_id = s.organization_id
          WHERE p.organization_id = $1
            AND s.current_state = 'PAYMENT_READY'
            AND p.payment_status = 'SCHEDULED'
            AND p.payment_due_date <= CURRENT_DATE
          `,
          [organization_id]
        );

        for (const payment of duePayments.rows) {

          const { payment_id, invoice_id } = payment;

          // Use transaction for safety
          const client = await pool.connect();
          try {
            await client.query("BEGIN");

            await client.query(
              `
              UPDATE invoice_payment_schedule
              SET payment_status = 'COMPLETED',
                  paid_at = NOW()
              WHERE payment_id = $1
              `,
              [payment_id]
            );

            await client.query(
              `
              UPDATE invoice_state_machine
              SET current_state = 'COMPLETED',
                  last_updated = NOW()
              WHERE invoice_id = $1
                AND organization_id = $2
              `,
              [invoice_id, organization_id]
            );

            await client.query(
              `
              INSERT INTO audit_event_log
              (invoice_id, organization_id, event_type, severity, description)
              VALUES ($1,$2,$3,$4,$5)
              `,
              [
                invoice_id,
                organization_id,
                "PAYMENT_EXECUTED",
                "INFO",
                "Payment executed on due date"
              ]
            );

            await client.query("COMMIT");

            console.log("Payment executed:", invoice_id);

          } catch (err) {
            await client.query("ROLLBACK");
            console.error("Payment execution failed:", err.message);
          } finally {
            client.release();
          }
        }

        continue; // skip normal SLA logic
      }


      const overdue = await pool.query(
        `
        SELECT invoice_id
        FROM invoice_state_machine
        WHERE organization_id = $1
          AND current_state = $2
          AND last_updated < NOW() - ($3 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM audit_event_log a
            WHERE a.invoice_id = invoice_state_machine.invoice_id
              AND a.organization_id = invoice_state_machine.organization_id
              AND a.event_type = 'SLA_BREACH'
          )
        `,
        [organization_id, state_name, sla_days]
      );

      if (!overdue.rows.length) continue;

      for (const invoice of overdue.rows) {

        const { invoice_id } = invoice;

        // AUTO BLOCK
        if (escalation_level === "AUTO_BLOCK") {
          await pool.query(
            `
            UPDATE invoice_state_machine
            SET current_state = 'BLOCKED',
                last_updated = NOW()
            WHERE invoice_id = $1
              AND organization_id = $2
            `,
            [invoice_id, organization_id]
          );
        }

        // ESCALATE
        if (escalation_level === "ESCALATE") {

          await pool.query(
            `
            UPDATE invoice_approval_workflow
            SET escalated = TRUE
            WHERE invoice_id = $1
              AND organization_id = $2
              AND approval_status = 'PENDING'
            `,
            [invoice_id, organization_id]
          );

          await pool.query(
            `
            INSERT INTO audit_event_log
            (invoice_id, organization_id, event_type, severity, description)
            VALUES ($1,$2,$3,$4,$5)
            `,
            [
              invoice_id,
              organization_id,
              "SLA_ESCALATED",
              "HIGH",
              `Escalation triggered for state ${state_name}`
            ]
          );
        }

        // Log breach
        await pool.query(
          `
          INSERT INTO audit_event_log
          (invoice_id, organization_id, event_type, severity, description)
          VALUES ($1,$2,$3,$4,$5)
          `,
          [
            invoice_id,
            organization_id,
            "SLA_BREACH",
            "HIGH",
            `SLA breached for state ${state_name}. Action: ${escalation_level}`
          ]
        );

        await redis.xAdd("invoice_events", "*", {
          invoice_id,
          organization_id
        });

        console.log("SLA breach handled:", invoice_id, state_name);
      }
    }

  } catch (err) {
    console.error("SLA Monitor Error:", err.message);
  }

}, 60000);