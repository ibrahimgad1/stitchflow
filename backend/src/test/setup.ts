import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { closeDatabase } from "../database/connection.js";

beforeEach(() => {
  closeDatabase();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-test-"));
  process.env.DATABASE_PATH = path.join(tempDir, "test.db");
});

afterEach(() => {
  closeDatabase();
});
