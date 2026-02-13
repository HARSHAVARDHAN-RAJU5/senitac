import pool from "../db.js";
import validateVendor from "../step3-validation/services/servicesValidation.js";
import matchInvoice from "../step4-matching/services/servicesMatching.js";
import { runCompliance } from "../step5-compliance/services/servicesCompliance.js";

export async function execute(invoice_id) {
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
      return { nextState: "BLOCKED" };
    }
    return { nextState: "PENDING_APPROVAL" };
  }

  if (validationResult.status === "BLOCKED") {
    return { nextState: "BLOCKED" };
  }

  const matchingResult = await matchInvoice(invoice_id);

  if (!matchingResult.success) {
    return { nextState: "BLOCKED" };
  }

  const complianceResult = await runCompliance(invoice_id);

  if (!complianceResult.success) {
    return { nextState: "BLOCKED" };
  }

  const overall = complianceResult.status;

  if (overall === "BLOCKED") {
    return { nextState: "BLOCKED" };
  }

  if (overall === "CONDITIONAL") {
    return { nextState: "PENDING_APPROVAL" };
  }

  if (overall === "COMPLIANT") {
    return { nextState: "PENDING_APPROVAL" };
  }

  throw new Error("Unexpected compliance status");
}
