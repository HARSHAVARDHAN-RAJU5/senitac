import BaseAgent from "./BaseAgent.js";
import { execute as ValidationWorker } from "../workers/ValidationWorker.js";
import pool from "../db.js";
import axios from "axios";

export default class ValidationAgent extends BaseAgent {

  constructor(context) {
    super(context);
  }

  async plan() {
    return { action: "RUN_VENDOR_VALIDATION" };
  }

  async act() {
    return await ValidationWorker(this.context);
  }

  async evaluate(result) {

    if (!result) {
      return {
        nextState: "BLOCKED",
        reason: "Validation worker returned no result"
      };
    }

    if (result.success === false) {
      return {
        nextState: "BLOCKED",
        reason: result.reason || "Validation failed"
      };
    }

    // 🔥 Direct governance route
    if (result.status === "EXCEPTION_REVIEW") {
      return {
        nextState: "EXCEPTION_REVIEW",
        reason: result.reason
      };
    }

    if (result.status === "BLOCKED") {
      return {
        nextState: "BLOCKED",
        reason: result.reason || "Validation rule blocked invoice"
      };
    }

    if (result.status === "VALID") {
      return {
        nextState: "MATCHING",
        reason: "Validation successful"
      };
    }

    if (result.status === "REVIEW_REQUIRED") {

      const context = await this.buildRiskContext();
      const llmDecision = await this.callLLM(context);

      if (llmDecision === "PROCEED") {
        return {
          nextState: "MATCHING",
          reason: "LLM approved invoice after review"
        };
      }

      if (llmDecision === "WAIT") {
        return {
          nextState: "WAITING_INFO",
          reason: "LLM requested additional vendor information"
        };
      }

      return {
        nextState: "BLOCKED",
        reason: "LLM flagged invoice as high risk"
      };
    }

    return {
      nextState: "BLOCKED",
      reason: "Unhandled validation state"
    };
  }

  async buildRiskContext() {

    const extracted = await pool.query(
      `
      SELECT data
      FROM invoice_extracted_data 
      WHERE invoice_id = $1 
        AND organization_id = $2
      `,
      [this.invoice_id, this.organization_id]
    );

    const validation = await pool.query(
      `
      SELECT *
      FROM invoice_validation_results 
      WHERE invoice_id = $1 
        AND organization_id = $2
      `,
      [this.invoice_id, this.organization_id]
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
- PROCEED
- WAIT
- BLOCK

Respond with only one word.
`;

    try {
      const response = await axios.post(
        "http://127.0.0.1:11434/api/generate",
        {
          model: "llama3",
          prompt,
          stream: false
        }
      );

      const output = response.data?.response?.trim()?.toUpperCase();

      if (!output) return "BLOCK";
      if (output.includes("PROCEED")) return "PROCEED";
      if (output.includes("WAIT")) return "WAIT";

      return "BLOCK";

    } catch {
      return "BLOCK";
    }
  }
}