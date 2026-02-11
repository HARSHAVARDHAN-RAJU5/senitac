import db from "../../db.js";

export async function schedulePayment(invoiceData, approvalData) {

    const { invoice_id, due_date, payment_method } = invoiceData;
    const { approval_status } = approvalData;

    if (approval_status !== "APPROVED") {
        return {
            invoice_id,
            error: "Invoice not approved. Cannot schedule payment."
        };
    }

    const result = await db.query(
        `INSERT INTO invoice_payment_schedule
        (invoice_id, payment_due_date, payment_method)
        VALUES ($1, $2, $3)
        RETURNING *`,
        [invoice_id, due_date, payment_method]
    );

    return result.rows[0];
}
