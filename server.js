import express from "express";
import pool from "./db.js";
import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redis = createClient({
  url: "redis://127.0.0.1:6379"
});

await redis.connect();


app.get("/api/vendor/verify-bank", async (req, res) => {
  try {

    const { invoice_id, decision, token } = req.query;

    if (!invoice_id || !decision || !token) {
      return res.status(400).send("Missing parameters");
    }

    const stateRes = await pool.query(
      `SELECT current_state, verification_token, token_expiry
       FROM invoice_state_machine
       WHERE invoice_id = $1`,
      [invoice_id]
    );

    if (!stateRes.rows.length) {
      return res.status(404).send("Invoice not found");
    }

    const state = stateRes.rows[0];

    if (state.current_state !== "WAITING_INFO") {
      return res.status(400).send("Invoice not awaiting verification");
    }

    if (state.verification_token !== token) {
      return res.status(403).send("Invalid token");
    }

    if (!state.token_expiry || new Date(state.token_expiry) < new Date()) {
      return res.status(403).send("Token expired");
    }


    if (decision === "CONFIRMED") {

      const invoiceRes = await pool.query(
        `SELECT data FROM invoice_extracted_data WHERE invoice_id = $1`,
        [invoice_id]
      );

      const validationRes = await pool.query(
        `SELECT vendor_id FROM invoice_validation_results WHERE invoice_id = $1`,
        [invoice_id]
      );

      if (!invoiceRes.rows.length || !validationRes.rows.length) {
        return res.status(500).send("Data missing");
      }

      const newBank = invoiceRes.rows[0].data.bank_account;
      const vendorId = validationRes.rows[0].vendor_id;

      await pool.query(
        `UPDATE vendor_master SET bank_account = $1 WHERE vendor_id = $2`,
        [newBank, vendorId]
      );

      await pool.query(
        `UPDATE invoice_state_machine
         SET current_state = 'PENDING_APPROVAL',
             waiting_reason = NULL,
             waiting_since = NULL,
             waiting_deadline = NULL,
             verification_token = NULL,
             token_expiry = NULL,
             last_updated = NOW()
         WHERE invoice_id = $1`,
        [invoice_id]
      );

      await pool.query(
        `INSERT INTO audit_event_log
         (invoice_id, event_type, severity, description)
         VALUES ($1,$2,$3,$4)`,
        [
          invoice_id,
          "BANK_VERIFIED",
          "MEDIUM",
          "Vendor confirmed bank change. Master record updated."
        ]
      );

      await redis.xAdd("invoice_events", "*", { invoice_id });

      return res.send(`
        <h3>Bank details confirmed.</h3>
        <p>Invoice processing resumed.</p>
      `);
    }


    if (decision === "REJECTED") {

      await pool.query(
        `UPDATE invoice_state_machine
         SET current_state = 'EXCEPTION_REVIEW',
             waiting_reason = NULL,
             waiting_since = NULL,
             waiting_deadline = NULL,
             verification_token = NULL,
             token_expiry = NULL,
             last_updated = NOW()
         WHERE invoice_id = $1`,
        [invoice_id]
      );

      await pool.query(
        `INSERT INTO audit_event_log
         (invoice_id, event_type, severity, description)
         VALUES ($1,$2,$3,$4)`,
        [
          invoice_id,
          "BANK_VERIFICATION_REJECTED",
          "HIGH",
          "Vendor rejected bank change. Escalated to CFO."
        ]
      );

      await redis.xAdd("invoice_events", "*", { invoice_id });

      return res.send(`
        <h3>Bank change rejected.</h3>
        <p>Escalated for CFO review.</p>
      `);
    }

    return res.status(400).send("Invalid decision value");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});


app.post("/api/internal/cfo/approve", async (req, res) => {
  try {

    const { invoice_id } = req.body;

    if (!invoice_id) {
      return res.status(400).send("invoice_id required");
    }

    const stateRes = await pool.query(
      `SELECT current_state FROM invoice_state_machine WHERE invoice_id = $1`,
      [invoice_id]
    );

    if (!stateRes.rows.length) {
      return res.status(404).send("Invoice not found");
    }

    if (stateRes.rows[0].current_state !== "EXCEPTION_REVIEW") {
      return res.status(400).send("Invoice not in EXCEPTION_REVIEW");
    }

    await pool.query(
      `UPDATE invoice_state_machine
       SET current_state = 'PENDING_APPROVAL',
           last_updated = NOW()
       WHERE invoice_id = $1`,
      [invoice_id]
    );

    await pool.query(
      `INSERT INTO audit_event_log
       (invoice_id, event_type, severity, description)
       VALUES ($1,$2,$3,$4)`,
      [
        invoice_id,
        "CFO_APPROVED_EXCEPTION",
        "HIGH",
        "CFO approved invoice under exception review."
      ]
    );

    await redis.xAdd("invoice_events", "*", { invoice_id });

    res.send("CFO approval successful. Invoice resumed.");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});


app.post("/api/internal/cfo/reject", async (req, res) => {
  try {

    const { invoice_id } = req.body;

    if (!invoice_id) {
      return res.status(400).send("invoice_id required");
    }

    const stateRes = await pool.query(
      `SELECT current_state FROM invoice_state_machine WHERE invoice_id = $1`,
      [invoice_id]
    );

    if (!stateRes.rows.length) {
      return res.status(404).send("Invoice not found");
    }

    if (stateRes.rows[0].current_state !== "EXCEPTION_REVIEW") {
      return res.status(400).send("Invoice not in EXCEPTION_REVIEW");
    }

    await pool.query(
      `UPDATE invoice_state_machine
       SET current_state = 'BLOCKED',
           last_updated = NOW()
       WHERE invoice_id = $1`,
      [invoice_id]
    );

    await pool.query(
      `INSERT INTO audit_event_log
       (invoice_id, event_type, severity, description)
       VALUES ($1,$2,$3,$4)`,
      [
        invoice_id,
        "CFO_REJECTED_EXCEPTION",
        "HIGH",
        "CFO rejected invoice under exception review."
      ]
    );

    await redis.xAdd("invoice_events", "*", { invoice_id });

    res.send("Invoice rejected by CFO.");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});


app.listen(3000, () => {
  console.log("Verification & CFO API running on port 3000");
});
