import BaseAgent from "./BaseAgent.js";
import { execute as ValidationWorker } from "../workers/ValidationWorker.js";
import pool from "../db.js";
import axios from "axios";

export default class ValidationAgent extends BaseAgent {

  async plan() {
    return { invoice_id: this.invoice_id };
  }

  async act(plan) {
    const result = await ValidationWorker(plan.invoice_id);
    return result;
  }

  async observe(result) {
    return result;
  }

  async evaluate(result) {

    if (!result || result.success === false) {
      return { nextState: "BLOCKED" };
    }

    if (result.status === "BLOCKED") {
      return { nextState: "BLOCKED" };
    }

    if (result.status === "VALID") {
      return { nextState: "MATCHING" };
    }

    // 🔹 LLM reasoning for REVIEW_REQUIRED
    if (result.status === "REVIEW_REQUIRED") {

      const context = await this.buildRiskContext();

      const llmDecision = await this.callLLM(context);

      if (llmDecision === "PROCEED") {
        return { nextState: "MATCHING" };
      }

      if (llmDecision === "WAIT") {
        return { nextState: "WAITING_INFO" };
      }

      return { nextState: "BLOCKED" };
    }

    return { nextState: "BLOCKED" };
  }

  async buildRiskContext() {

    const extracted = await pool.query(
      `SELECT data FROM invoice_extracted_data WHERE invoice_id = $1`,
      [this.invoice_id]
    );

    const validation = await pool.query(
      `SELECT * FROM invoice_validation_results WHERE invoice_id = $1`,
      [this.invoice_id]
    );

    return {
      extracted: extracted.rows[0]?.data || {},
      validation: validation.rows[0] || {}
    };
  }

  async callLLM(context) {

    const prompt = `
You are a financial risk analyst.

Given this invoice validation result:

${JSON.stringify(context)}

Decide:
- PROCEED (safe to continue)
- WAIT (needs more info from vendor)
- BLOCK (likely fraud)

Respond with only one word: PROCEED / WAIT / BLOCK.
`;

    const response = await axios.post("http://127.0.0.1:11434/api/generate", {
      model: "llama3",
      prompt,
      stream: false
    });

    const output = response.data.response.trim().toUpperCase();

    if (output.includes("PROCEED")) return "PROCEED";
    if (output.includes("WAIT")) return "WAIT";

    return "BLOCK";
  }
}
