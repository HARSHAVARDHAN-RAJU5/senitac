import { logAgentAction } from "../core/AgentLogger.js";

export default class BaseAgent {

  constructor(context) {
    this.context = context;
    this.invoice_id = context.invoice_id;
    this.organization_id = context.organization_id;
    this.config = context.config;
  }

  async plan() {
    throw new Error("plan() not implemented");
  }

  async act(plan) {
    throw new Error("act() not implemented");
  }

  async observe(result) {
    return result;
  }

  async evaluate(observation) {
    throw new Error("evaluate() not implemented");
  }

  async run() {

    const state_name = this.constructor.name;

    try {

      // PLAN
      const plan = await this.plan();

      await logAgentAction({
        invoice_id: this.invoice_id,
        organization_id: this.organization_id,
        agent_name: state_name,
        state_name,
        action: "PLAN",
        input: null,
        output: plan,
        success: true
      });

      // ACT
      const result = await this.act(plan);

      await logAgentAction({
        invoice_id: this.invoice_id,
        organization_id: this.organization_id,
        agent_name: state_name,
        state_name,
        action: "ACT",
        input: plan,
        output: result,
        success: true
      });

      // OBSERVE
      const observation = await this.observe(result);

      // EVALUATE
      const decision = await this.evaluate(observation);

      await logAgentAction({
        invoice_id: this.invoice_id,
        organization_id: this.organization_id,
        agent_name: state_name,
        state_name,
        action: "EVALUATE",
        input: observation,
        output: decision,
        success: true
      });

      if (!decision || !decision.nextState) {
        throw new Error("Agent did not return valid decision");
      }

      return decision;

    } catch (err) {

      await logAgentAction({
        invoice_id: this.invoice_id,
        organization_id: this.organization_id,
        agent_name: state_name,
        state_name,
        action: "ERROR",
        success: false,
        error_message: err.message
      });

      throw err;
    }
  }
}