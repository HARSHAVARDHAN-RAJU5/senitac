import BaseAgent from "./BaseAgent.js";
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
        nextState: "VALIDATING",
        reason: "No duplicate detected"
      };
    }

    if (observation.outcome === "DUPLICATE_CONFIRMED") {
      return {
        nextState: "BLOCKED",
        reason: "Duplicate invoice confirmed"
      };
    }

    if (observation.outcome === "POTENTIAL_DUPLICATE") {
      return {
        nextState: "EXCEPTION_REVIEW",
        reason: "Potential duplicate requires manual review"
      };
    }

    if (observation.outcome === "DATA_MISSING") {
      return {
        nextState: "BLOCKED",
        reason: observation.reason || "Extraction data missing"
      };
    }

    return {
      nextState: "BLOCKED",
      reason: "Unhandled duplicate state"
    };
  }
}
