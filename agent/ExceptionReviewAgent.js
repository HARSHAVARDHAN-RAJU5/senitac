import BaseAgent from "./BaseAgent.js";
import pool from "../db.js";

export default class ExceptionReviewAgent extends BaseAgent {

  constructor(context) {
    super(context);
  }

  async plan() {
    return {
      action: "CHECK_EXCEPTION_DECISION"
    };
  }

  async act(plan) {

    const res = await pool.query(
      `
      SELECT id, decision
      FROM exception_review_decisions
      WHERE invoice_id = $1
      AND organization_id = $2
      AND processed = false
      ORDER BY decided_at DESC
      LIMIT 1
      `,
      [this.invoice_id, this.organization_id]
    );

    if (!res.rows.length) {
      return { success: true, decisionFound: false };
    }

    return {
      success: true,
      decisionFound: true,
      decision: res.rows[0].decision,
      decisionId: res.rows[0].id
    };
  }

  async evaluate(observation) {

    if (!observation?.success) {
      return {
        nextState: "EXCEPTION_REVIEW",
        reason: "Decision lookup failed"
      };
    }

    if (!observation.decisionFound) {
      return {
        nextState: "EXCEPTION_REVIEW"
      };
    }

    await pool.query(
      `
      UPDATE exception_review_decisions
      SET processed = true
      WHERE id = $1
      AND organization_id = $2
      `,
      [observation.decisionId, this.organization_id]
    );

    if (observation.decision === "APPROVE") {
      return {
        nextState: "PENDING_APPROVAL",
        reason: "Approved via dashboard"
      };
    }

    if (observation.decision === "BLOCK") {
      return {
        nextState: "BLOCKED",
        reason: "Blocked via dashboard"
      };
    }

    return {
      nextState: "EXCEPTION_REVIEW",
      reason: "Invalid decision value"
    };
  }
}