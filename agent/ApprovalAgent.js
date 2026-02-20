import BaseAgent from "./BaseAgent.js";
import * as ApprovalWorker from "../workers/ApprovalWorker.js";

export default class ApprovalAgent extends BaseAgent {

  async plan() {
    return { action: "RUN_APPROVAL_ROUTING" };
  }

  async act() {
    return await ApprovalWorker.execute(
      this.invoice_id,
      this.organization_id
    );
  }

  async evaluate(observation) {

    if (!observation || observation.success !== true) {
      return {
        nextState: "BLOCKED",
        reason: observation?.reason || "Approval routing failed"
      };
    }

    return {
      nextState: observation.status || "APPROVED",
      reason: "Approval workflow completed"
    };
  }
}