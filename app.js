import express from "express";


import invoiceIntakeRoutes from "./modules/step1-intake/routes/invoiceIntake.js";
import invoiceExtractionRoutes from "./modules/step2-extraction/routes/invoiceExtraction.js";
import invoiceValidationRoutes from "./modules/step3-validation/routes/routesValidation.js";
import invoiceMatchingRoutes from "./modules/step4-matching/routes/routesMatching.js";
import invoiceComplianceRoutes from "./modules/step5-compliance/routes/routesCompliance.js";
import invoiceApprovalRoutes from "./modules/step6-approval/routes/approvalRoutes.js";
import exceptionReviewRoutes from "./routes/exceptionReviewRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";

const app = express();

app.use(express.json());

// STEP 1 – Intake
app.use("/api/invoices/intake", invoiceIntakeRoutes);

// STEP 2 – Extraction
app.use("/api/invoices/extract", invoiceExtractionRoutes);

// STEP 3 – Vendor Validation
app.use("/api/invoices/validate", invoiceValidationRoutes);

// STEP 4 – PO Matching
app.use("/api/invoices/match", invoiceMatchingRoutes);

// STEP 5 – Compliance Engine
app.use("/api/invoices/compliance", invoiceComplianceRoutes);

// STEP 6 – Approval & Workflow
app.use("/api/invoices/approval", invoiceApprovalRoutes);

app.use("/api/exception-review", exceptionReviewRoutes);

app.use("/api/payment", paymentRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
