import db from "../../../db.js";
import PolicyEngine from "../../core/PolicyEngine.js";

export async function runPaymentScheduling(invoice_id, organization_id) {

  // Check approval status (tenant isolated)
  const approvalRes = await db.query(
    `
    SELECT approval_status
    FROM invoice_approval_workflow
    WHERE invoice_id = $1
    AND organization_id = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [invoice_id, organization_id]
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

  // Fetch invoice data
  const invoiceRes = await db.query(
    `
    SELECT data
    FROM invoice_extracted_data
    WHERE invoice_id = $1
    AND organization_id = $2
    `,
    [invoice_id, organization_id]
  );

  if (!invoiceRes.rows.length) {
    return {
      success: false,
      status: "BLOCKED",
      reason: "Invoice data not found"
    };
  }

  const invoiceData = invoiceRes.rows[0].data;

  // Load dynamic payment policy (SaaS ready)
  const paymentPolicy = await PolicyEngine.getPaymentPolicy(organization_id);

  const dueDate =
    invoiceData.due_date ||
    paymentPolicy.default_payment_terms_days
      ? calculateDueDate(
          paymentPolicy.default_payment_terms_days
        )
      : null;

  const paymentMethod =
    invoiceData.payment_method ||
    paymentPolicy.default_payment_method ||
    "BANK_TRANSFER";

  if (!dueDate) {
    return {
      success: false,
      status: "BLOCKED",
      reason: "Payment due date missing"
    };
  }

  // Insert / Update schedule (multi-tenant safe)
  await db.query(
    `
    INSERT INTO invoice_payment_schedule
    (invoice_id, organization_id, payment_status,
     payment_due_date, payment_method, scheduled_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (invoice_id, organization_id)
    DO UPDATE SET
      payment_status = EXCLUDED.payment_status,
      payment_due_date = EXCLUDED.payment_due_date,
      payment_method = EXCLUDED.payment_method
    `,
    [
      invoice_id,
      organization_id,
      "SCHEDULED",
      dueDate,
      paymentMethod
    ]
  );

  return {
    success: true,
    status: "PAYMENT_READY"
  };
}


// Helper (pure utility, not state logic)
function calculateDueDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date;
}