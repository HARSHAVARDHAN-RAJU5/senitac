import BaseAgent from "./BaseAgent.js";
import * as ApprovalWorker from "../workers/ApprovalWorker.js";

export default class ApprovalAgent extends BaseAgent {

  async plan() {
    return { action: "RUN_APPROVAL_ROUTING" };
  }

  async act() {
    return await ApprovalWorker.execute(this.invoice_id);
  }

  async evaluate(observation) {
    if (!observation || observation.success !== true) {
      return {
        nextState: "BLOCKED",
        reason: "Approval routing failed"
      };
    }

    return {
      nextState: "APPROVED",
      reason: "Approved by approval workflow"
    };
  }
}
