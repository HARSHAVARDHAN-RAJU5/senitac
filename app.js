import express from "express";

import invoiceIntakeRoutes from "./step1-intake/routes/invoiceIntake.js";
import invoiceExtractionRoutes from "./step2-extraction/routes/invoiceExtraction.js";
import invoiceValidationRoutes from "./step3-validation/routes/step3.routes.js";

const app = express();

app.use(express.json());

// STEP 1 – Intake
app.use("/api/invoices/intake", invoiceIntakeRoutes);

// STEP 2 – Extraction
app.use("/api/invoices/extract", invoiceExtractionRoutes);

// STEP 3 – Vendor Validation
app.use("/api/invoices/validate", invoiceValidationRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
