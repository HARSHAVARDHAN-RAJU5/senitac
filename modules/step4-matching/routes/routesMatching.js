import express from "express";
import { runMatching } from "../services/servicesMatching.js";

const router = express.Router();

router.post("/:invoice_id", async (req, res) => {
  try {
    const invoiceId = req.params.invoice_id;

    const result = await runMatching(invoiceId);

    res.json(result);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "STEP 4 matching failed" });
  }
});

export default router;
