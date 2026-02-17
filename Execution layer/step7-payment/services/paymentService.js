import db from "../../../db.js";

export async function runPaymentScheduling(invoice_id) {

    const approvalRes = await db.query(
        `
        SELECT approval_status
        FROM invoice_approval_workflow
        WHERE invoice_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [invoice_id]
    );

    if (!approvalRes.rows.length) {
        return {
            success: false,
            status: "BLOCKED",
            reason: "Approval record not found"
        };
    }

    if (approvalRes.rows[0].approval_status !== "APPROVED") {
        return {
            success: false,
            status: "BLOCKED",
            reason: "Invoice not approved"
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

    const dueDate = invoiceData.due_date;
    const paymentMethod = invoiceData.payment_method || "BANK_TRANSFER";

    await db.query(
        `
        INSERT INTO invoice_payment_schedule
        (invoice_id, payment_status, payment_due_date, payment_method, scheduled_at)
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [invoice_id, "SCHEDULED", dueDate, paymentMethod]
    );

    return {
        success: true,
        status: "PAYMENT_READY"
    };
}
