import { runMatching } from "../Execution layer/step4-matching/services/servicesMatching.js";
import { runCompliance } from "../Execution layer/step5-compliance/services/servicesCompliance.js";

export async function execute(context) {

  const { invoice_id, organization_id } = context;

  if (!invoice_id || !organization_id) {
    throw new Error("MatchingWorker requires invoice_id and organization_id");
  }

  // Run PO Matching (context-aware)
  const matching = await runMatching(context);

  if (!matching?.success) {
    return {
      success: false,
      stage: "MATCHING",
      reason: matching?.reason || "Matching failed"
    };
  }

  // Run Compliance (context-aware)
  const compliance = await runCompliance(context);

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