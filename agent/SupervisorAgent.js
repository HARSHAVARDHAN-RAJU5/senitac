import pool from "../db.js";

import IntakeExtractionAgent from "./IntakeExtractionAgent.js";
import DuplicateAgent from "./DuplicateAgent.js";
import ValidationAgent from "./ValidationAgent.js";
import MatchingPreparationAgent from "./MatchingPreparationAgent.js";
import MatchingAgent from "./MatchingAgent.js";
import ApprovalAgent from "./ApprovalAgent.js";
import PaymentAgent from "./PaymentAgent.js";
import ExceptionReviewAgent from "./ExceptionReviewAgent.js";

export default class SupervisorAgent {

  constructor(invoice_id) {
    this.invoice_id = invoice_id;
  }

  async getCurrentState() {

    const res = await pool.query(
      `SELECT current_state
       FROM invoice_state_machine
       WHERE invoice_id = $1`,
      [this.invoice_id]
    );

    if (!res.rows.length) {
      throw new Error("Invoice state not found");
    }

    return res.rows[0].current_state;
  }

  selectAgent(state) {

    switch (state) {

      case "RECEIVED":
        return new IntakeExtractionAgent(this.invoice_id);

      case "STRUCTURED":
        return new DuplicateAgent(this.invoice_id);

      case "VALIDATING":
        return new ValidationAgent(this.invoice_id);

      case "MATCHING":
        return new MatchingAgent(this.invoice_id);

      case "PENDING_APPROVAL":
        return new ApprovalAgent(this.invoice_id);

      case "APPROVED":
        return new PaymentAgent(this.invoice_id);

      case "PAYMENT_READY":
        return new PaymentAgent(this.invoice_id);

      case "EXCEPTION_REVIEW":
        return new ExceptionReviewAgent(this.invoice_id);

      default:
        throw new Error(`No agent mapped for state: ${state}`);
    }
  }

  async executeStep() {

    const state = await this.getCurrentState();

    const agent = this.selectAgent(state);

    const decision = await agent.run();

    if (!decision || !decision.nextState) {
      throw new Error("Agent did not return valid nextState");
    }

    return {
      invoice_id: this.invoice_id,
      state,
      decision
    };
  }
}
