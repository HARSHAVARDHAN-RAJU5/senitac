import policyRules from "../rules/policyRules.js";

export const evaluatePolicy = (invoice, poResult) => {

  if (poResult.missing_po_flag) {
    return { status: "FAIL", reason: "Missing PO" };
  }

  if (poResult.price_variance_flag) {
    return { status: "CONDITIONAL", reason: "Price variance exceeded" };
  }

  const total =
    invoice.invoice_total ||
    invoice.invoice_amount ||
    0;

  if (total > policyRules.approvalThreshold){
    return { status: "CONDITIONAL", reason: "High value invoice" };
  }

  return { status: "PASS" };
};
