import pool from "../db.js";
import nodemailer from "nodemailer";

export async function execute(invoice_id, reason) {
  try {

    const res = await pool.query(
      `SELECT vm.email,
              ied.data
       FROM invoice_extracted_data ied
       JOIN vendor_master vm
         ON vm.vendor_id = ied.data->>'vendor_id'
       WHERE ied.invoice_id = $1`,
      [invoice_id]
    );

    if (!res.rows.length) {
      console.log("NotificationWorker: Vendor not found");
      return;
    }

    const { email, data } = res.rows[0];

    if (!email) {
      console.log("NotificationWorker: Vendor has no email");
      return;
    }

    const invoiceNumber = data.invoice_number;

    // 🔥 Update link
    const updateLink = `http://localhost:3000/api/vendor/update-link?invoice_id=${invoice_id}`;

    const html = `
      <p>Dear Vendor,</p>

      <p>Your invoice <b>${invoiceNumber}</b> requires additional information.</p>

      <p><b>Reason:</b> ${reason}</p>

      <p>Please update the missing information using the secure link below:</p>

      <p>
        <a href="${updateLink}">Update Invoice</a>
      </p>

      <p>This invoice will be automatically rejected in 10 days if unresolved.</p>

      <br/>
      <p>Finance Team</p>
    `;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Action Required: Missing Invoice Information",
      html
    });

    console.log("Notification sent to:", email);

  } catch (error) {
    console.error("NotificationWorker error:", error.message);
  }
}
