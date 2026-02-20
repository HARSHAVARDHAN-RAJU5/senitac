import { runMatching } from "../Execution layer/step4-matching/services/servicesMatching.js";
import { runCompliance } from "../Execution layer/step5-compliance/services/servicesCompliance.js";

export async function execute(invoice_id, organization_id) {

  if (!invoice_id || !organization_id) {
    throw new Error("MatchingWorker requires invoice_id and organization_id");
  }

  // Run PO Matching
  const matching = await runMatching(invoice_id, organization_id);

  if (!matching?.success) {
    return {
      success: false,
      stage: "MATCHING",
      reason: matching?.reason || "Matching failed"
    };
  }

  // Run Compliance
  const compliance = await runCompliance(invoice_id, organization_id);

  if (!compliance?.success) {
    return {
      success: false,
      stage: "COMPLIANCE",
      reason: compliance?.reason || "Compliance failed"
    };
  }

  // Merge deterministic signals
  return {
    success: true,
    signals: {
      ...(matching.signals || {}),
      ...(compliance.signals || {})
    }
  };
}