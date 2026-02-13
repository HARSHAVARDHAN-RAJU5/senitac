import express from "express";
import { schedulePayment } from "../services/paymentService.js";

const router = express.Router();

router.post("/step7/schedule", async (req, res) => {
    try {
        const { invoiceData, approvalData } = req.body;

        const result = await schedulePayment(invoiceData, approvalData);

        res.json({
            message: "Step 7 payment scheduled",
            data: result
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
