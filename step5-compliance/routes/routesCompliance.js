import express from "express";
import { runCompliance } from "../services/servicesCompliance.js";

const router = express.Router();

router.post("/:invoice_id", async (req, res) => {
  try {
    const result = await runCompliance(req.params.invoice_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
