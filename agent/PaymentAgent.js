import BaseAgent from "./BaseAgent.js";
import * as PaymentWorker from "../workers/PaymentWorker.js";

export default class PaymentAgent extends BaseAgent {

  async plan() {
    return { action: "RUN_PAYMENT_PROCESS" };
  }

  async act() {
    return await PaymentWorker.execute(
      this.invoice_id,
      this.organization_id
    );
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