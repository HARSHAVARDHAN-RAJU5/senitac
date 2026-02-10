import express from "express";
import invoiceIntakeRoutes from "./step1-intake/routes/invoiceIntake.js";

const app = express();

app.use(express.json());
app.use("/api/invoices/intake", invoiceIntakeRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
