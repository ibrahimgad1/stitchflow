import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { authRouter } from "./routes/auth.js";
import { colorsRouter } from "./routes/colors.js";
import { customerPaymentsRouter } from "./routes/customer-payments.js";
import { customersRouter } from "./routes/customers.js";
import { expenseCategoriesRouter } from "./routes/expense-categories.js";
import { expensesRouter } from "./routes/expenses.js";
import { finishedInventoryRouter } from "./routes/finished-inventory.js";
import { healthRouter } from "./routes/health.js";
import { materialReceivingsRouter } from "./routes/material-receivings.js";
import { materialsRouter } from "./routes/materials.js";
import { modelsRouter } from "./routes/models.js";
import { ownersRouter } from "./routes/owners.js";
import { paymentMethodsRouter } from "./routes/payment-methods.js";
import { alertsRouter } from "./routes/alerts.js";
import { overheadRouter } from "./routes/overhead.js";
import { productionBatchesRouter } from "./routes/production-batches.js";
import { reportsRouter } from "./routes/reports.js";
import { safesRouter } from "./routes/safes.js";
import { salesInvoicesRouter } from "./routes/sales-invoices.js";
import { sizesRouter } from "./routes/sizes.js";
import { supplierPaymentsRouter } from "./routes/supplier-payments.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { treasuryRouter } from "./routes/treasury.js";
import { usersRouter } from "./routes/users.js";
import { backupsRouter } from "./routes/backups.js";

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));

  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", usersRouter);
  app.use("/api", customersRouter);
  app.use("/api", salesInvoicesRouter);
  app.use("/api", customerPaymentsRouter);
  app.use("/api", suppliersRouter);
  app.use("/api", materialsRouter);
  app.use("/api", materialReceivingsRouter);
  app.use("/api", supplierPaymentsRouter);
  app.use("/api", sizesRouter);
  app.use("/api", colorsRouter);
  app.use("/api", modelsRouter);
  app.use("/api", safesRouter);
  app.use("/api", paymentMethodsRouter);
  app.use("/api", expenseCategoriesRouter);
  app.use("/api", expensesRouter);
  app.use("/api", treasuryRouter);
  app.use("/api", ownersRouter);
  app.use("/api", alertsRouter);
  app.use("/api", overheadRouter);
  app.use("/api", productionBatchesRouter);
  app.use("/api", finishedInventoryRouter);
  app.use("/api", reportsRouter);
  app.use("/api", backupsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({
      statusCode: 404,
      message: "Not found"
    });
  });

  // Global unhandled error handler middleware
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    console.error("Unhandled server error:", err);
    const status = err.status ?? err.statusCode ?? 500;
    const message = process.env.NODE_ENV === "production"
      ? "Internal server error"
      : (err.message ?? "Internal server error");

    res.status(status).json({
      statusCode: status,
      message
    });
  });

  return app;
}
