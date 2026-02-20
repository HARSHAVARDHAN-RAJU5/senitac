import BaseAgent from "./BaseAgent.js";
import * as IntakeExtractionWorker from "../workers/IntakeExtractionWorker.js";

export default class IntakeExtractionAgent extends BaseAgent {

  constructor(context) {
    super(context);
  }

  async plan() {
    return {
      action: "RUN_EXTRACTION"
    };
  }

  async act(plan) {
    return await IntakeExtractionWorker.execute(this.context);
  }

  async evaluate(observation) {

    if (!observation) {
      return {
        nextState: "WAITING_INFO",
        reason: "NO_EXTRACTION_RESPONSE"
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
      case "FILE_NOT_FOUND":
        return {
          nextState: "WAITING_INFO",
          reason: observation.failure_type
        };

      default:
        return {
          nextState: "WAITING_INFO",
          reason: observation.failure_type || "UNKNOWN_EXTRACTION_ERROR"
        };
    }
  }
}