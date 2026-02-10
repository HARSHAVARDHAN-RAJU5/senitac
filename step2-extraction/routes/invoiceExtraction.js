import express from "express";
import { extractInvoice } from "../services/extractionService.js";

const router = express.Router();

router.post("/:invoice_id", async (req, res) => {
  try {
    const { invoice_id } = req.params;
    const data = await extractInvoice(invoice_id);

    res.status(200).json({
      message: "Invoice extracted successfully",
      invoice_id,
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Invoice extraction failed" });
  }
});

export default router;
