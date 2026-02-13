import pool from "../db.js";

import validateVendor from "../step3-validation/services/serviceValidation.js";
import matchInvoice from "../step4-matching/services/serviceMatching.js";
import { runCompliance } from "../step5-compliance/services/servicesCompliance.js";

class FinancialControlWorker {

  async execute(invoice_id) {

    const stateCheck = await pool.query(
      `
      SELECT current_state
      FROM invoice_state_machine
      WHERE invoice_id = $1
      `,
      [invoice_id]
    );

    if (!stateCheck.rows.length) {
      throw new Error("State record not found");
    }

    const currentState = stateCheck.rows[0].current_state;

    if (currentState !== "STRUCTURED") {
      throw new Error("Invalid state for FinancialControlWorker");
    }

    const validationResult = await validateVendor(invoice_id);

    if (!validationResult.success) {
      if (validationResult.status === "BLOCKED") {
        return { next_state: "BLOCKED" };
      }

      return { next_state: "PENDING_APPROVAL" };
    }

    if (validationResult.status === "BLOCKED") {
      return { next_state: "BLOCKED" };
    }

    const matchingResult = await matchInvoice(invoice_id);

    if (!matchingResult.success) {
      return { next_state: "BLOCKED" };
    }

    const complianceResult = await runCompliance(invoice_id);

    if (!complianceResult.success) {
      return { next_state: "BLOCKED" };
    }

    const overall = complianceResult.status;

    if (overall === "BLOCKED") {
      return { next_state: "BLOCKED" };
    }

    if (overall === "CONDITIONAL") {
      return { next_state: "PENDING_APPROVAL" };
    }

    if (overall === "COMPLIANT") {
      return { next_state: "PENDING_APPROVAL" };
    }

    throw new Error("Unexpected compliance status");
  }
}

export default new FinancialControlWorker();
