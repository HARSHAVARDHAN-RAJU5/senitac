const express = require("express");
const router = express.Router();
const validateVendor = require("../services/step3.service");

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

module.exports = router;
