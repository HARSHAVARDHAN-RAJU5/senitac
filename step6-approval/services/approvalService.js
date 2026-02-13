import db from "../../db.js";
import { determineApprovalLevel } from "./approvalRules.js";

export async function runApproval(invoice_id) {

    const complianceRes = await db.query(
        `
        SELECT overall_compliance_status
        FROM invoice_compliance_results
        WHERE invoice_id = $1
        `,
        [invoice_id]
    );

    if (!complianceRes.rows.length) {
        return {
            success: false,
            status: "BLOCKED",
            reason: "Compliance result not found"
        };
    }

    const complianceStatus = complianceRes.rows[0].overall_compliance_status;

    if (complianceStatus === "BLOCKED") {
        return {
            success: false,
            status: "BLOCKED",
            reason: "Compliance failure"
        };
    }

    const invoiceRes = await db.query(
        `
        SELECT data
        FROM invoice_extracted_data
        WHERE invoice_id = $1
        `,
        [invoice_id]
    );

    if (!invoiceRes.rows.length) {
        return {
            success: false,
            status: "BLOCKED",
            reason: "Invoice data not found"
        };
    }

    const invoiceData = invoiceRes.rows[0].data;
    const invoiceTotal = invoiceData.invoice_total;

    const approvalLevel = determineApprovalLevel(invoiceTotal);

    await db.query(
        `
        INSERT INTO invoice_approval_workflow
        (invoice_id, assigned_to, approval_level, approval_status, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [invoice_id, approvalLevel, approvalLevel, "APPROVED"]
    );

    return {
        success: true,
        status: "APPROVED",
        approval_level: approvalLevel
    };
}
