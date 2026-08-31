import { Router } from "express";
import { getDatabase } from "../database/connection.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  const db = getDatabase();
  db.prepare("SELECT 1").get();

  res.json({
    status: "ok",
    database: "ok",
    timestamp: new Date().toISOString()
  });
});

