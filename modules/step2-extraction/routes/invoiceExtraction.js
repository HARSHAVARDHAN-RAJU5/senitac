import express from "express";
import extractAndStructure  from "../services/extractionService.js";

const router = express.Router();

/*
  Manual extraction trigger (for testing only)
  Normally extraction is triggered automatically
  by orchestrator when state = RECEIVED
*/

router.post("/run", async (req, res) => {
  const { invoice_id, organization_id } = req.body;

  if (!invoice_id || !organization_id) {
    return res.status(400).json({
      error: "invoice_id and organization_id are required"
    });
  }

  try {
    const result = await extractAndStructure({
      invoice_id,
      organization_id
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("STEP 2 extraction error:", err);
    return res.status(500).json({
      error: "Extraction failed"
    });
  }
});

export default router;