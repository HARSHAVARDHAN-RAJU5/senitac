import BaseAgent from "./BaseAgent.js";
import * as ApprovalWorker from "../workers/ApprovalWorker.js";

export default class ApprovalAgent extends BaseAgent {

  constructor(context) {
    super(context);
  }

  async plan() {
    return {
      action: "RUN_APPROVAL_ROUTING"
    };
  }

  async act(plan) {
    return await ApprovalWorker.execute(this.context);
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