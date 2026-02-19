import { runMatching } from "../Execution layer/step4-matching/services/servicesMatching.js";
import { runCompliance } from "../Execution layer/step5-compliance/services/servicesCompliance.js";

export async function execute(invoice_id) {

  const matching = await runMatching(invoice_id);
  if (!matching.success) return { success: false };

  const compliance = await runCompliance(invoice_id);
  if (!compliance.success) return { success: false };

  return {
    success: true,
    signals: {
      ...matching.signals,
      ...compliance.signals
    }
  };
}
