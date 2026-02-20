import BaseAgent from "./BaseAgent.js";
import * as PaymentWorker from "../workers/PaymentWorker.js";

export default class PaymentAgent extends BaseAgent {

  constructor(context) {
    super(context);
  }

  async plan() {
    return {
      action: "RUN_PAYMENT_PROCESS"
    };
  }

  async act(plan) {
    return await PaymentWorker.execute(this.context);
  }

  async evaluate(observation) {

    if (!observation?.success) {
      return {
        retry: true,
        reason: observation?.reason || "Payment failed"
      };
    }

    return {
      nextState: observation.nextState
    };
  }
}