import express from "express";
const router = express.Router();
import validateVendor from "../services/servicesValidation.js";

router.post("/validate/:invoice_id", async (req, res) => {
  try {
    const invoiceId = req.params.invoice_id;

    const result = await validateVendor(invoiceId);

    res.json(result);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "STEP 3 validation failed" });
  }
});

export default router;
