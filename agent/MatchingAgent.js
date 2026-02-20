import BaseAgent from "./BaseAgent.js";
import * as Worker from "../workers/MatchingWorker.js";
import axios from "axios";

function safeParseLLM(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Invalid LLM JSON:", raw);
    return null;
  }
}

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export default class MatchingAgent extends BaseAgent {

  async plan() {
    return { action: "EVALUATE" };
  }

  async act() {
    // ORG-SAFE CALL
    return await Worker.execute(
      this.invoice_id,
      this.organization_id
    );
  }

  async evaluate(observation) {

    if (!observation.success) {
      return { nextState: "BLOCKED", reason: "Signal collection failed" };
    }

    const prompt = `
You are an enterprise AP risk evaluator.

Signals:
${JSON.stringify(observation.signals)}

Respond ONLY with valid JSON.
No explanations.
No markdown.
No extra text.

Format:
{
  "classification": "VALID" | "REVIEW" | "WAITING_INFO" | "BLOCKED",
  "reason": "short explanation",
  "risk_score": 0-100
}
`;

    const response = await axios.post(
      "http://127.0.0.1:11434/api/generate",
      {
        model: "llama3",
        prompt,
        stream: false
      }
    );

    const raw = response.data.response?.trim();

    console.log("LLM RAW:", raw);

    const jsonBlock = extractJSON(raw);

    if (!jsonBlock) {
      return {
        nextState: "BLOCKED",
        reason: "Invalid LLM output format"
      };
    }

    const output = safeParseLLM(jsonBlock);

    if (!output || !output.classification) {
      return {
        nextState: "BLOCKED",
        reason: "Malformed LLM JSON"
      };
    }

    switch (output.classification) {

      case "BLOCKED":
        return { nextState: "BLOCKED", reason: output.reason };

      case "WAITING_INFO":
        return { nextState: "WAITING_INFO", reason: output.reason };

      case "REVIEW":
        return { nextState: "EXCEPTION_REVIEW", reason: output.reason };

      case "VALID":
        return { nextState: "PENDING_APPROVAL", reason: output.reason };

      default:
        return {
          nextState: "BLOCKED",
          reason: "Unknown LLM classification"
        };
    }
  }
}
