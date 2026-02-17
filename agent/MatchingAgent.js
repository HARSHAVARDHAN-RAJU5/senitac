import BaseAgent from "./BaseAgent.js";
import * as FinancialControlWorker from "../workers/FinancialControlWorker.js";

async function callLLM(prompt) {
  const res = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt,
      format: "json",
      stream: false
    })
  });

  const data = await res.json();
  return JSON.parse(data.response);
}

export default class MatchingAgent extends BaseAgent {

  async plan() {
    return { action: "RUN_FINANCIAL_CONTROL" };
  }

  async act() {
    return await FinancialControlWorker.execute(this.invoice_id);
  }

  async evaluate(observation) {

    if (!observation || !observation.success) {
      return { nextState: "BLOCKED", reason: "Worker failure" };
    }

    switch (observation.outcome) {

      case "COMPLIANCE_BLOCKED":
        return { nextState: "BLOCKED", reason: "Compliance blocked" };

      case "BANK_MISMATCH":
        return { nextState: "WAITING_INFO", reason: "Bank mismatch" };

      case "PO_EXCEPTION":
        return { nextState: "EXCEPTION_REVIEW", reason: "PO mismatch or missing" };

      case "READY_FOR_RISK_ANALYSIS":
        break;

      default:
        return { nextState: "EXCEPTION_REVIEW", reason: "Unhandled outcome" };
    }

    // ===============================
    // LLM Risk Analysis
    // ===============================

    const prompt = `
You are an Accounts Payable Risk Analyst.

Assess risk of this invoice.

Return JSON:
{
  "recommended_action": "APPROVE | REQUEST_INFO | ESCALATE | BLOCK",
  "reasoning": "short explanation"
}

Data:
${JSON.stringify(observation.data)}
`;

    let llm;

    try {
      llm = await callLLM(prompt);
    } catch {
      return { nextState: "EXCEPTION_REVIEW", reason: "LLM failure" };
    }

    switch (llm.recommended_action) {

      case "APPROVE":
        return { nextState: "PENDING_APPROVAL", reason: llm.reasoning };

      case "REQUEST_INFO":
        return { nextState: "WAITING_INFO", reason: llm.reasoning };

      case "ESCALATE":
        return { nextState: "EXCEPTION_REVIEW", reason: llm.reasoning };

      case "BLOCK":
        return { nextState: "BLOCKED", reason: llm.reasoning };

      default:
        return { nextState: "EXCEPTION_REVIEW", reason: "Invalid LLM output" };
    }
  }
}
