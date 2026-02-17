import express from "express";
import pool from "./db.js";
import { createClient } from "redis";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redis = createClient({
  url: "redis://127.0.0.1:6379"
});

await redis.connect();


app.get("/api/vendor/update-link", async (req, res) => {
  const { invoice_id } = req.query;

  if (!invoice_id) {
    return res.status(400).send("Missing invoice_id");
  }

  res.send(`
    <h2>Update Invoice ${invoice_id}</h2>
    <form method="POST" action="/api/vendor/update">
      <input type="hidden" name="invoice_id" value="${invoice_id}" />
      
      <label>PO Number:</label>
      <input type="text" name="po_number" required />
      
      <br/><br/>
      <button type="submit">Submit</button>
    </form>
  `);
});


app.post("/api/vendor/update", async (req, res) => {
  try {

    const { invoice_id, po_number } = req.body;

    if (!invoice_id) {
      return res.status(400).send("invoice_id required");
    }

    const result = await pool.query(
      `SELECT data
       FROM invoice_extracted_data
       WHERE invoice_id = $1`,
      [invoice_id]
    );

    if (!result.rows.length) {
      return res.status(404).send("Invoice not found");
    }

    const currentData = result.rows[0].data;

    const updatedData = {
      ...currentData,
      po_number
    };

    await pool.query(
      `UPDATE invoice_extracted_data
       SET data = $1
       WHERE invoice_id = $2`,
      [updatedData, invoice_id]
    );

    await redis.xAdd("invoice_events", "*", {
      invoice_id
    });

    res.send(`
      <h3>Invoice updated successfully.</h3>
      <p>Processing has resumed.</p>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.listen(3000, () => {
  console.log("Vendor update API running on port 3000");
});
