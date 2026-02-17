import pool from "../db.js";
import nodemailer from "nodemailer";

export async function execute(invoice_id) {
  try {

    // 1️⃣ Fetch state info
    const stateRes = await pool.query(
      `
      SELECT waiting_reason, verification_token
      FROM invoice_state_machine
      WHERE invoice_id = $1
      `,
      [invoice_id]
    );

    if (!stateRes.rows.length) {
      console.log("NotificationWorker: State not found");
      return;
    }

    const { waiting_reason, verification_token } = stateRes.rows[0];

    if (!waiting_reason) {
      console.log("NotificationWorker: No waiting reason");
      return;
    }

    // 2️⃣ Fetch vendor + invoice info properly
    const dataRes = await pool.query(
      `
      SELECT vm.email,
             vm.legal_name,
             ied.data,
             ivr.vendor_id
      FROM invoice_validation_results ivr
      JOIN vendor_master vm
        ON vm.vendor_id = ivr.vendor_id
      JOIN invoice_extracted_data ied
        ON ied.invoice_id = ivr.invoice_id
      WHERE ivr.invoice_id = $1
      `,
      [invoice_id]
    );

    if (!dataRes.rows.length) {
      console.log("NotificationWorker: Vendor data not found");
      return;
    }

    const { email, legal_name, data } = dataRes.rows[0];

    if (!email) {
      console.log("NotificationWorker: Vendor has no email");
      return;
    }

    const invoiceNumber = data.invoice_number || invoice_id;

    let subject = "";
    let html = "";

    if (waiting_reason === "BANK_VERIFICATION_REQUIRED") {

      if (!verification_token) {
        console.log("NotificationWorker: Missing verification token");
        return;
      }

      const confirmLink =
        `http://localhost:3000/api/vendor/verify-bank?invoice_id=${invoice_id}&decision=CONFIRMED&token=${verification_token}`;

      const rejectLink =
        `http://localhost:3000/api/vendor/verify-bank?invoice_id=${invoice_id}&decision=REJECTED&token=${verification_token}`;

      subject = `Bank Verification Required: Invoice ${invoiceNumber}`;

      html = `
        <p>Dear ${legal_name},</p>

        <p>We detected a bank account change in invoice <b>${invoiceNumber}</b>.</p>

        <p>Please confirm whether this change is valid:</p>

        <p>
          <a href="${confirmLink}">Confirm Bank Change</a>
        </p>

        <p>
          <a href="${rejectLink}">Reject Bank Change</a>
        </p>

        <p>If no response is received within 3 days, this invoice will be escalated for manual review.</p>

        <br/>
        <p>Finance Team</p>
      `;
    }

    else {

      const updateLink =
        `http://localhost:3000/api/vendor/update-link?invoice_id=${invoice_id}`;

      subject = `Action Required: Invoice ${invoiceNumber}`;

      html = `
        <p>Dear ${legal_name},</p>

        <p>Your invoice <b>${invoiceNumber}</b> requires additional information.</p>

        <p>Please update the missing information using the secure link below:</p>

        <p>
          <a href="${updateLink}">Update Invoice</a>
        </p>

        <p>This invoice may be rejected if unresolved.</p>

        <br/>
        <p>Finance Team</p>
      `;
    }

    // 3️⃣ Configure SMTP
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // 4️⃣ Send Email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html
    });

    console.log("Notification sent to:", email);

    // 5️⃣ Audit log
    await pool.query(
      `
      INSERT INTO audit_event_log
      (invoice_id, event_type, severity, description)
      VALUES ($1,$2,$3,$4)
      `,
      [
        invoice_id,
        "NOTIFICATION_SENT",
        "INFO",
        `Notification sent for reason: ${waiting_reason}`
      ]
    );

  } catch (error) {
    console.error("NotificationWorker error:", error.message);
  }
}
