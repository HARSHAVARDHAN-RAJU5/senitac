export default class BaseAgent {
  constructor(invoice_id, organization_id) {
    this.invoice_id = invoice_id;
    this.organization_id = organization_id;
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
    const plan = await this.plan();
    const result = await this.act(plan);
    const observation = await this.observe(result);
    const decision = await this.evaluate(observation);

    if (!decision || !decision.nextState) {
      throw new Error("Agent did not return valid decision");
    }

    return decision;
  }
}
