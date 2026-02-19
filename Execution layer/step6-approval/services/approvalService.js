import db from "../../../db.js";
import { determineApprovalLevel } from "./approvalRules.js";

export async function runApproval(invoice_id) {

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
            reason: "Invoice data not found"
        };
    }

    const invoiceData = invoiceRes.rows[0].data;
    const invoiceTotal = invoiceData.total_amount;

    if (!invoiceTotal) {
        return {
            success: false,
            reason: "Invoice total missing"
        };
    }

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
