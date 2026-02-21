import express from "express";
import multer from "multer";
import { handleInvoiceIntake } from "../services/intakeService.js";

const router = express.Router();
const upload = multer(); 

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Invoice file is required"
    });
  }

  try {
    const result = await handleInvoiceIntake({
      file: req.file,
      source: "portal",
      receivedFrom: "manual-upload",
      extraMetadata: {}
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error("STEP 1 upload error:", err);
    return res.status(500).json({
      error: "Failed to process invoice intake"
    });
  }
});

router.post("/email", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Invoice file is required"
    });
  }

  const { sender, subject } = req.body;

  try {
    const result = await handleInvoiceIntake({
      file: req.file,
      source: "email",
      receivedFrom: sender || "unknown-sender",
      extraMetadata: { subject }
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error("STEP 1 email error:", err);
    return res.status(500).json({
      error: "Failed to process invoice intake"
    });
  }
});

router.post("/api", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Invoice file is required"
    });
  }

  const { system_id } = req.body;

  try {
    const result = await handleInvoiceIntake({
      file: req.file,
      source: "api",
      receivedFrom: system_id || "unknown-system",
      extraMetadata: {}
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error("STEP 1 api error:", err);
    return res.status(500).json({
      error: "Failed to process invoice intake"
    });
  }
});

export default router;
