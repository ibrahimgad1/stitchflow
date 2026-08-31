import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { loadEnv } from "../config/env.js";
import { getDatabase } from "./connection.js";
import { migrate } from "./migrate.js";

const roles = [
  { id: "role-admin", name: "admin", description: "Full system access" },
  { id: "role-staff", name: "staff", description: "Factory employee access" }
];

const sequences = [
  ["sales_invoice", "SI-", 1, 5],
  ["customer_payment", "CP-", 1, 5],
  ["supplier_payment", "SP-", 1, 5],
  ["material_receiving", "MR-", 1, 5],
  ["production_batch", "PB-", 1, 5],
  ["expense", "EXP-", 1, 5],
  ["safe_transfer", "TR-", 1, 5]
] as const;

const defaultSizes = [
  { id: "size-unspecified", name: "Unspecified", sortOrder: 0 },
  { id: "size-s", name: "S", sortOrder: 10 },
  { id: "size-m", name: "M", sortOrder: 20 },
  { id: "size-l", name: "L", sortOrder: 30 },
  { id: "size-xl", name: "XL", sortOrder: 40 }
];

const defaultColors = [
  { id: "color-unspecified", name: "Unspecified", sortOrder: 0 },
  { id: "color-white", name: "White", sortOrder: 10 },
  { id: "color-black", name: "Black", sortOrder: 20 },
  { id: "color-navy", name: "Navy", sortOrder: 30 }
];

const defaultPaymentMethods = [
  { id: "pm-cash", name: "Cash" },
  { id: "pm-bank", name: "Bank Transfer" },
  { id: "pm-check", name: "Check" }
];

const defaultExpenseCategories = [
  { id: "ec-rent", name: "Rent", isOverhead: true },
  { id: "ec-utilities", name: "Utilities", isOverhead: true },
  { id: "ec-salaries", name: "Salaries", isOverhead: true },
  { id: "ec-maintenance", name: "Maintenance", isOverhead: false },
  { id: "ec-transport", name: "Transport", isOverhead: false }
];

export function seed(): void {
  migrate();

  const env = loadEnv();
  const db = getDatabase();

  const runSeed = db.transaction(() => {
    const insertRole = db.prepare(`
      INSERT INTO roles (id, name, description)
      VALUES (@id, @name, @description)
      ON CONFLICT(name) DO UPDATE SET description = excluded.description
    `);

    for (const role of roles) {
      insertRole.run(role);
    }

    const adminExists = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(env.defaultAdminUsername);

    if (!adminExists) {
      const passwordHash = bcrypt.hashSync(env.defaultAdminPassword, 12);
      db.prepare(`
        INSERT INTO users (id, username, display_name, password_hash, role_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        env.defaultAdminUsername,
        "System Admin",
        passwordHash,
        "role-admin"
      );
    }

    const insertSequence = db.prepare(`
      INSERT INTO document_sequences (id, document_type, prefix, next_number, padding)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(document_type) DO NOTHING
    `);

    for (const [documentType, prefix, nextNumber, padding] of sequences) {
      insertSequence.run(randomUUID(), documentType, prefix, nextNumber, padding);
    }

    db.prepare(`
      INSERT INTO app_settings (key, value_json)
      VALUES ('locale', '{"language":"ar","direction":"rtl"}')
      ON CONFLICT(key) DO NOTHING
    `).run();

    const insertSize = db.prepare(`
      INSERT INTO sizes (id, name, sort_order, is_active)
      VALUES (@id, @name, @sortOrder, 1)
      ON CONFLICT(name) DO NOTHING
    `);
    for (const size of defaultSizes) {
      insertSize.run(size);
    }

    const insertColor = db.prepare(`
      INSERT INTO colors (id, name, sort_order, is_active)
      VALUES (@id, @name, @sortOrder, 1)
      ON CONFLICT(name) DO NOTHING
    `);
    for (const color of defaultColors) {
      insertColor.run(color);
    }

    const insertPaymentMethod = db.prepare(`
      INSERT INTO payment_methods (id, name, is_active)
      VALUES (@id, @name, 1)
      ON CONFLICT(name) DO NOTHING
    `);
    for (const method of defaultPaymentMethods) {
      insertPaymentMethod.run(method);
    }

    const insertExpenseCategory = db.prepare(`
      INSERT INTO expense_categories (id, name, is_overhead, is_active)
      VALUES (@id, @name, @isOverhead, 1)
      ON CONFLICT(name) DO NOTHING
    `);
    for (const category of defaultExpenseCategories) {
      insertExpenseCategory.run({
        ...category,
        isOverhead: category.isOverhead ? 1 : 0
      });
    }
  });

  runSeed();
  console.log("Seed completed. Default admin username:", env.defaultAdminUsername);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed();
}

