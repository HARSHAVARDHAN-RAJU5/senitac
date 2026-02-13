import policyRules from "../rules/policyRules.js";

export const evaluatePolicy = (invoice, poResult) => {

  if (poResult.missing_po_flag) {
    return { status: "FAIL", reason: "Missing PO" };
  }

  if (poResult.price_variance_flag) {
    return { status: "CONDITIONAL", reason: "Price variance exceeded" };
  }

  if (invoice.data.invoice_total > policyRules.approvalThreshold) {
    return { status: "CONDITIONAL", reason: "High value invoice" };
  }

  return { status: "PASS" };
};
