import pool from "../db.js";

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

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status}`);
  }

  const data = await res.json();

  if (!data.response) {
    throw new Error("Invalid LLM response structure");
  }

  return data.response;
}

export async function execute(invoice_id) {
  const stateCheck = await pool.query(
    `SELECT current_state FROM invoice_state_machine WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!stateCheck.rows.length) {
    throw new Error("State record not found");
  }

  const currentState = stateCheck.rows[0].current_state;

  if (currentState !== "MATCHING") {
    throw new Error("Invalid state for FinancialControlWorker");
  }


  const invoiceData = await pool.query(
    `SELECT data FROM invoice_extracted_data WHERE invoice_id = $1`,
    [invoice_id]
  );

  const validationData = await pool.query(
    `SELECT * FROM invoice_validation_results WHERE invoice_id = $1`,
    [invoice_id]
  );

  const matchingData = await pool.query(
    `SELECT * FROM invoice_po_matching_results WHERE invoice_id = $1`,
    [invoice_id]
  );

  const complianceData = await pool.query(
    `SELECT * FROM invoice_compliance_results WHERE invoice_id = $1`,
    [invoice_id]
  );

  if (!invoiceData.rows.length) {
    return { nextState: "BLOCKED" };
  }

  if (!complianceData.rows.length) {
    console.error("Missing compliance result");
    return { nextState: "BLOCKED" };
  }

  const complianceStatus =
    complianceData.rows[0].overall_compliance_status;

  if (complianceStatus === "BLOCKED") {
    return { nextState: "BLOCKED" };
  }

  if (complianceStatus === "BLOCKED") {
    return { nextState: "BLOCKED" };
  }


  const riskPayload = {
    invoice: invoiceData.rows[0].data,
    validation: validationData.rows[0] || {},
    po_matching: matchingData.rows[0] || {},
    compliance: complianceData.rows[0]
  };

  const prompt = `
You are an Accounts Payable Risk Analyst AI.
Analyze invoice risk strictly from the structured JSON below.
Return valid JSON only.

${JSON.stringify(riskPayload)}

Return format:
{
  "risk_level": "LOW | MEDIUM | HIGH",
  "fraud_suspected": true | false,
  "reasoning": "short explanation",
  "recommended_action": "APPROVE | REQUEST_INFO | ESCALATE | BLOCK"
}
`;

  let llmResult;

  try {
    const raw = await callLLM(prompt);
    llmResult = JSON.parse(raw);

    if (
      !llmResult.risk_level ||
      !llmResult.recommended_action
    ) {
      throw new Error("Incomplete LLM response");
    }

  } catch (err) {
    console.error("LLM Error:", err.message);

    llmResult = {
      risk_level: "HIGH",
      fraud_suspected: true,
      reasoning: "LLM failure or invalid output",
      recommended_action: "ESCALATE"
    };
  }

  await pool.query(
    `
    INSERT INTO invoice_risk_assessment
    (invoice_id, risk_level, fraud_suspected, reasoning, recommended_action)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (invoice_id)
    DO UPDATE SET
      risk_level = EXCLUDED.risk_level,
      fraud_suspected = EXCLUDED.fraud_suspected,
      reasoning = EXCLUDED.reasoning,
      recommended_action = EXCLUDED.recommended_action,
      assessed_at = NOW()
    `,
    [
      invoice_id,
      llmResult.risk_level,
      llmResult.fraud_suspected,
      llmResult.reasoning,
      llmResult.recommended_action
    ]
  );
  console.log("LLM RESULT:", llmResult);

  switch (llmResult.recommended_action) {
    case "APPROVE":
      return { nextState: "PENDING_APPROVAL" };

    case "REQUEST_INFO":
      return { nextState: "WAITING_INFO" };

    case "ESCALATE":
      return { nextState: "EXCEPTION_REVIEW" };

    case "BLOCK":
      return { nextState: "BLOCKED" };

    default:
      return { nextState: "EXCEPTION_REVIEW" };
  }
}
