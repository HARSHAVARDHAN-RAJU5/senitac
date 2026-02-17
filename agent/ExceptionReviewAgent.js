import BaseAgent from "./BaseAgent.js";
import pool from "../db.js";

export default class ExceptionReviewAgent extends BaseAgent {

  async plan() {
    return { action: "CHECK_EXCEPTION_DECISION" };
  }

  async act() {

    const res = await pool.query(
      `SELECT decision, processed
       FROM exception_review_decisions
       WHERE invoice_id = $1`,
      [this.invoice_id]
    );

    if (!res.rows.length) {
      return { decisionFound: false };
    }

    if (res.rows[0].processed === true) {
      return { decisionFound: false };
    }

    return {
      decisionFound: true,
      decision: res.rows[0].decision
    };
  }

  async evaluate(observation) {

    if (!observation.decisionFound) {
      // Stay in EXCEPTION_REVIEW
      return {
        nextState: "EXCEPTION_REVIEW"
      };
    }

    // Mark as processed
    await pool.query(
      `UPDATE exception_review_decisions
       SET processed = true
       WHERE invoice_id = $1`,
      [this.invoice_id]
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
      reason: "Invalid decision state"
    };
  }
}
