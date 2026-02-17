import BaseAgent from "../agent/BaseAgent.js";
import * as DuplicateWorker from "../workers/DuplicateWorker.js";

export default class DuplicateAgent extends BaseAgent {

  async plan() {
    return { action: "RUN_DUPLICATE_CHECK" };
  }

  async act() {
    return await DuplicateWorker.execute(this.invoice_id);
  }

  async evaluate(observation) {

    if (!observation) {
      return {
        nextState: "BLOCKED",
        reason: "Duplicate check failed"
      };
    }

    if (observation.outcome === "NO_DUPLICATE") {
      return {
        nextState: "VALIDATING"
      };
    }

    if (observation.outcome === "DUPLICATE_CONFIRMED") {
      return {
        nextState: "BLOCKED",
        reason: "Duplicate invoice detected"
      };
    }

    if (observation.outcome === "POTENTIAL_DUPLICATE") {
      return {
        nextState: "EXCEPTION_REVIEW",
        reason: "Potential duplicate requires review"
      };
    }

    if (observation.outcome === "DATA_MISSING") {
      return {
        nextState: "BLOCKED",
        reason: observation.reason
      };
    }

    return {
      nextState: "BLOCKED",
      reason: "Unhandled duplicate state"
    };
  }
}
