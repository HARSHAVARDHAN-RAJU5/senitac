import express from "express";
import { processStep6 } from "../services/approvalService.js";

const router = express.Router();

router.post("/step6/process", async (req, res) => {
    try {
        const { invoiceData, complianceData } = req.body;

        const result = await processStep6(invoiceData, complianceData);

        res.json({
            message: "Step 6 processed successfully",
            data: result
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
