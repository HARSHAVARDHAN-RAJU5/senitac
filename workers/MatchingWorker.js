import pool from "../db.js";
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

  if (currentState !== "VALIDATING") {
    throw new Error("Invalid state for MatchingWorker");
  }

const matchingResult = await matchInvoice(invoice_id);
console.log("Matching Result:", matchingResult);

if (!matchingResult || matchingResult.success !== true) {
  console.log("Blocked: Matching failed");
  return { nextState: "BLOCKED" };
}

if (matchingResult.status === "MISMATCH") {
  console.log("Blocked: PO Mismatch");
  return { nextState: "BLOCKED" };
}

const complianceResult = await runCompliance(invoice_id);
console.log("Compliance Result:", complianceResult);

if (!complianceResult || complianceResult.success !== true) {
  console.log("Blocked: Compliance failed");
  return { nextState: "BLOCKED" };
}

if (complianceResult.status === "BLOCKED") {
  console.log("Blocked: Compliance status BLOCKED");
  return { nextState: "BLOCKED" };
}


  return {
    nextState: "MATCHING"
  };
}
