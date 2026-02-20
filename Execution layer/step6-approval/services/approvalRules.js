import PolicyEngine from "../../../core/PolicyEngine.js";

export async function determineApprovalLevel(invoiceTotal, organization_id) {

  const policyRows = await PolicyEngine.getApprovalPolicy(organization_id);

  for (const row of policyRows) {
    if (
      invoiceTotal >= row.min_amount &&
      invoiceTotal <= row.max_amount
    ) {
      return row.approval_level;
    }
  }

  throw new Error("No approval level configured for this amount");
}