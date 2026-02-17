import BaseAgent from "./BaseAgent.js";
import * as IntakeExtractionWorker from "../workers/IntakeExtractionWorker.js";

export default class IntakeExtractionAgent extends BaseAgent {

  async plan() {
    return { action: "RUN_EXTRACTION" };
  }

  async act(plan) {
    return await IntakeExtractionWorker.execute(this.invoice_id);
  }

async evaluate(observation) {

  if (!observation) {
    return {
      nextState: "EXCEPTION_REVIEW",
      reason: "No extraction response"
    };
  }

  if (observation.success) {
    return {
      nextState: "STRUCTURED",
      reason: "Invoice successfully extracted"
    };
  }

  switch (observation.failure_type) {

    case "LOW_QUALITY_PDF":
    case "CORRUPTED_PDF":
    case "PASSWORD_PROTECTED":
      return {
        nextState: "WAITING_INFO",
        reason: observation.failure_type
      };

    case "STATE_NOT_FOUND":
    case "INVALID_STATE":
      return {
        nextState: "EXCEPTION_REVIEW",
        reason: "Invalid state configuration"
      };

    default:
      return {
        nextState: "EXCEPTION_REVIEW",
        reason: observation.outcome || "Unknown extraction error"
      };
  }
}
}