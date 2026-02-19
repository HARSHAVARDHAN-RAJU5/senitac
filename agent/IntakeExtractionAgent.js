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

    // console.log("Extraction observation:", observation);
    // If worker crashed or returned nothing
    if (!observation) {
      return {
        nextState: "WAITING_INFO",
        reason: "NO_EXTRACTION_RESPONSE"
      };
    }

    // Successful extraction
    if (observation.success) {
      return {
        nextState: "STRUCTURED",
        reason: "Invoice successfully extracted"
      };
    }

    // Known extraction failures (vendor-fixable)
    switch (observation.failure_type) {

      case "LOW_QUALITY_PDF":
      case "CORRUPTED_PDF":
      case "PASSWORD_PROTECTED":
        return {
          nextState: "WAITING_INFO",
          reason: observation.failure_type
        };

      case "FILE_NOT_FOUND":
        return {
          nextState: "WAITING_INFO",
          reason: "FILE_NOT_FOUND"
        };

      default:
        return {
          nextState: "WAITING_INFO",
          reason: observation.failure_type || "UNKNOWN_EXTRACTION_ERROR"
        };
    }
  }
}
