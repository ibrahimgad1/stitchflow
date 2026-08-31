import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

export type AppEnv = {
  nodeEnv: string;
  host: string;
  port: number;
  databasePath: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  defaultAdminUsername: string;
  defaultAdminPassword: string;
};

export function loadEnv(): AppEnv {
  const port = Number(process.env.PORT ?? 3001);
  const databasePath = process.env.DATABASE_PATH ?? "data/app.dev.db";
  const jwtSecret = process.env.JWT_SECRET ?? "change-this-before-real-use";

  if ((process.env.NODE_ENV ?? "development") === "production" && jwtSecret === "change-this-before-real-use") {
    throw new Error("JWT_SECRET must be set to a strong value in production (NODE_ENV=production)");
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    host: process.env.HOST ?? "127.0.0.1",
    port: Number.isFinite(port) ? port : 3001,
    databasePath: path.resolve(databasePath),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
    defaultAdminUsername: process.env.DEFAULT_ADMIN_USERNAME ?? "admin",
    defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD ?? "Admin_12345"
  };
}
