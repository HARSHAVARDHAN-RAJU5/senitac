import pool from "../db.js";

async function updateFailurePattern(organization_id, vendor_id, failure_type) {

  const existing = await pool.query(
    `
    SELECT id, occurrence_count
    FROM failure_patterns
    WHERE organization_id = $1
      AND vendor_id = $2
      AND failure_type = $3
    `,
    [organization_id, vendor_id, failure_type]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `
      UPDATE failure_patterns
      SET occurrence_count = occurrence_count + 1,
          last_occurrence = NOW()
      WHERE id = $1
      `,
      [existing.rows[0].id]
    );
  } else {
    await pool.query(
      `
      INSERT INTO failure_patterns
      (organization_id, vendor_id, failure_type, occurrence_count, last_occurrence)
      VALUES ($1, $2, $3, 1, NOW())
      `,
      [organization_id, vendor_id, failure_type]
    );
  }
}

export async function reflect(context, currentState) {

  const { invoice_id, organization_id } = context;

  try {

    // Fetch vendor_id from invoice
    const invoiceRes = await pool.query(
      `
      SELECT vendor_id
      FROM invoices
      WHERE invoice_id = $1
        AND organization_id = $2
      `,
      [invoice_id, organization_id]
    );

    if (!invoiceRes.rows.length) {
      return null;
    }

    const vendor_id = invoiceRes.rows[0].vendor_id;

    // Fetch recent agent history
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

    let reflectionResult = null;

    if (failures.length >= 2) {

      if (currentState === "MATCHING") {

        await updateFailurePattern(
          organization_id,
          vendor_id,
          "MATCHING_FAILURE"
        );

        reflectionResult = {
          risk_score: null,
          decision_summary: "Repeated matching failure",
          overrideState: "EXCEPTION_REVIEW"
        };
      }

      if (currentState === "VALIDATING") {

        await updateFailurePattern(
          organization_id,
          vendor_id,
          "VALIDATION_FAILURE"
        );

        reflectionResult = {
          risk_score: null,
          decision_summary: "Repeated validation failure",
          overrideState: "WAITING_INFO"
        };
      }
    }

    // Store reflection log if triggered
    if (reflectionResult) {

      await pool.query(
        `
        INSERT INTO agent_reflection_log
        (invoice_id, organization_id, state, risk_score, decision_summary, override_state)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          invoice_id,
          organization_id,
          currentState,
          reflectionResult.risk_score,
          reflectionResult.decision_summary,
          reflectionResult.overrideState
        ]
      );

      return reflectionResult;
    }

    return null;

  } catch (error) {

    console.error("Reflection error:", error.message);
    return null;
  }
}