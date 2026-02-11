import db from "../../db.js";
import { determineApprovalLevel } from "./approvalRules.js";

export async function processStep6(invoiceData, complianceData) {

    const { invoice_id, invoice_total } = invoiceData;
    const { overall_compliance_status } = complianceData;

    // If compliance failed → reject immediately
    if (overall_compliance_status === "BLOCKED") {
        return {
            invoice_id,
            approval_status: "REJECTED",
            reason: "Compliance Failure"
        };
    }

    const approvalLevel = determineApprovalLevel(invoice_total);

    const result = await db.query(
        `INSERT INTO invoice_approval_workflow
        (invoice_id, assigned_to, approval_level)
        VALUES ($1, $2, $3)
        RETURNING *`,
        [invoice_id, approvalLevel, approvalLevel]
    );

    return result.rows[0];
}
