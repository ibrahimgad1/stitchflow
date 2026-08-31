import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Force dev DB path as backend/data/app.dev.db
process.env.DATABASE_PATH = path.resolve("backend/data/app.dev.db");
console.log("Target DB:", process.env.DATABASE_PATH);

// Do not delete file if locked - we will clean via SQL after migrate
// (WAL file may lock on Windows)

import { getDatabase, closeDatabase } from "../backend/src/database/connection.js";
import { migrate } from "../backend/src/database/migrate.js";
import { seed } from "../backend/src/database/seed.js";
import { createMaterialReceiving, createSupplierPayment } from "../backend/src/services/purchasing.js";
import { createProductionBatch, startProductionBatch, completeProductionBatch } from "../backend/src/services/production.js";
import { createSalesInvoice, confirmSalesInvoice, createCustomerPayment } from "../backend/src/services/sales.js";
import { createExpense, createSafeTransfer, createCapitalTransaction } from "../backend/src/services/treasury.js";
import { loadEnv } from "../backend/src/config/env.js";

migrate();
// seed() already done - skip re-seed to avoid id conflict (sizes/colors already exist)
const db = getDatabase();
try { seed(); } catch (e) { console.log("seed skipped (already seeded):", (e as Error).message.slice(0,80)); }

// Clean old test data (keep users/roles/sequences)
db.exec(`
  DELETE FROM customer_payment_allocations;
  DELETE FROM customer_payments;
  DELETE FROM sales_invoice_items;
  DELETE FROM sales_invoices;
  DELETE FROM customer_ledger_entries;
  DELETE FROM production_overhead_allocations;
  DELETE FROM finished_stock_movements;
  DELETE FROM production_cost_components;
  DELETE FROM production_material_consumptions;
  DELETE FROM production_batch_outputs;
  DELETE FROM production_batches;
  DELETE FROM overhead_entries;
  DELETE FROM overhead_periods;
  DELETE FROM material_stock_movements;
  DELETE FROM material_receiving_items;
  DELETE FROM material_receivings;
  DELETE FROM supplier_payment_allocations;
  DELETE FROM supplier_payments;
  DELETE FROM supplier_ledger_entries;
  DELETE FROM safe_transactions;
  DELETE FROM safe_transfers;
  DELETE FROM capital_transactions;
  DELETE FROM expenses;
  DELETE FROM audit_logs;
  DELETE FROM model_variants;
  DELETE FROM models;
  DELETE FROM materials;
  DELETE FROM suppliers;
  DELETE FROM customers;
  DELETE FROM safes;
  DELETE FROM owners;
`);
const env = loadEnv();
const adminId = (db.prepare("SELECT id FROM users WHERE username=?").get(env.defaultAdminUsername) as any).id;

function createCustomer(name: string) {
  const id = randomUUID();
  db.prepare(`INSERT INTO customers (id, company_name) VALUES (?,?)`).run(id, name);
  return id;
}
function createSupplier(name: string) {
  const id = randomUUID();
  db.prepare(`INSERT INTO suppliers (id, name) VALUES (?,?)`).run(id, name);
  return id;
}
function createSafe(name: string, opening: number) {
  const id = randomUUID();
  const minor = Math.round(opening * 100);
  db.prepare(`INSERT INTO safes (id, name, opening_balance_minor, current_balance_minor) VALUES (?,?,?,?)`).run(id, name, minor, minor);
  return id;
}
function createMaterial(name: string, unit: string, supplierId: string | null) {
  const id = randomUUID();
  db.prepare(`INSERT INTO materials (id, name, unit, supplier_id) VALUES (?,?,?,?)`).run(id, name, unit, supplierId);
  return id;
}
function createModel(code: string, name: string) {
  const id = randomUUID();
  db.prepare(`INSERT INTO models (id, model_code, model_name) VALUES (?,?,?)`).run(id, code, name);
  return id;
}
function createVariant(modelId: string, sizeId: string, colorId: string) {
  const id = randomUUID();
  db.prepare(`INSERT INTO model_variants (id, model_id, size_id, color_id) VALUES (?,?,?,?)`).run(id, modelId, sizeId, colorId);
  return id;
}

console.log("\nSeeding Excel-based data into DEV DB...");

// Customers
const c1 = createCustomer("علاء بوم ارض النت");
const c2 = createCustomer("4K حموده");
const c3 = createCustomer("مكتب القاضي");
const c4 = createCustomer("الاتشو");
const c5 = createCustomer("POINT زفتي (جديد)");

// Suppliers
const s1 = createSupplier("عبود");
const s2 = createSupplier("غياث");
const s3 = createSupplier("غياس تراب");

// Materials
const m1 = createMaterial("شطرنج اسود", "meter", s1);
const m2 = createMaterial("سمر ميلتون شانيه", "meter", s2);
const m3 = createMaterial("انترلوك اسود", "meter", s2);
const m4 = createMaterial("سمر ميلتون فوطه اسود", "meter", s3);

// Also keep user's existing problematic ones for continuity? No, fresh DB is clearer
// Safes
const mainSafe = createSafe("الخزنة الرئيسية", 50000);
const subSafe = createSafe("خزنة فرعية", 10000);

// Models
const modB01 = createModel("B01", "شروال سمر ميلتون جوردن");
const modB02 = createModel("B02", "شروال وايد ليج بالنسياجا انتر لوك");
const modB110 = createModel("B110", "شروال قصات انترلوك");
const modB03 = createModel("B03", "شروال سمر ميلتون اوفر سايز");
const modB04 = createModel("B04", "شروال باجي انتر لوك");

// Variants
const vB01 = createVariant(modB01, "size-m", "color-white");
const vB02 = createVariant(modB02, "size-l", "color-black");
const vB110 = createVariant(modB110, "size-m", "color-black");
const vB03 = createVariant(modB03, "size-m", "color-white");
const vB04 = createVariant(modB04, "size-l", "color-white");

console.log("Master data created");

// Receivings - same as test
const r1 = createMaterialReceiving(db, { supplierId: s1, receivingDate: "2026-08-29", items: [{ materialId: m1, quantity: 41.9, unitPrice: 195 }], createdBy: adminId });
const r2 = createMaterialReceiving(db, { supplierId: s2, receivingDate: "2026-08-29", items: [{ materialId: m2, quantity: 22.8, unitPrice: 310 }], createdBy: adminId });
const r3 = createMaterialReceiving(db, { supplierId: s2, receivingDate: "2026-08-29", items: [{ materialId: m3, quantity: 54, unitPrice: 390 }], createdBy: adminId });
console.log("Receivings:", r1.receivingNumber, r2.receivingNumber, r3.receivingNumber);

// Supplier payment
createSupplierPayment(db, { supplierId: s1, paymentDate: "2026-08-30", amount: 5000, safeId: mainSafe, allocations: [{ materialReceivingId: r1.id, allocatedAmount: 5000 }], createdBy: adminId });
console.log("Supplier payment 5000 done");

// Production
const b1 = createProductionBatch(db, { modelId: modB02, plannedQuantity: 91, consumptions: [{ materialId: m1, quantity: 20 }], outputs: [{ modelVariantId: vB02, goodQuantity: 20 }], costComponents: [{ componentName: "قص", amount: 230 }, { componentName: "باترون", amount: 500 }, { componentName: "مصنعية", amount: 2280 }, { componentName: "تشطيب", amount: 380 }], createdBy: adminId });
startProductionBatch(db, b1.id, "2026-08-29");
completeProductionBatch(db, b1.id, { completedDate: "2026-08-30", goodQuantity: 20, damagedQuantity: 1, createdBy: adminId });
console.log("Batch PB completed:", b1.batchNumber);

const b2 = createProductionBatch(db, { modelId: modB01, plannedQuantity: 20, consumptions: [{ materialId: m2, quantity: 10 }], outputs: [{ modelVariantId: vB01, goodQuantity: 15 }], costComponents: [{ componentName: "مصنعية B01", amount: 1000 }], createdBy: adminId });
startProductionBatch(db, b2.id);
completeProductionBatch(db, b2.id, { completedDate: "2026-08-30", goodQuantity: 15, createdBy: adminId });
console.log("Batch2 completed");

// Sales
const inv = createSalesInvoice(db, { customerId: c1, invoiceDate: "2026-08-30", items: [{ modelVariantId: vB02, quantity: 5, unitPrice: 370 }, { modelVariantId: vB01, quantity: 4, unitPrice: 325 }], createdBy: adminId });
confirmSalesInvoice(db, { salesInvoiceId: inv.id, confirmedBy: adminId });
console.log("Invoice SI confirmed:", inv.invoiceNumber);

// Customer payment
createCustomerPayment(db, { customerId: c1, paymentDate: "2026-08-30", amount: 2000, safeId: mainSafe, allocations: [{ salesInvoiceId: inv.id, allocatedAmount: 2000 }], createdBy: adminId });
console.log("Customer payment 2000 done");

// Expense, transfer, capital
createExpense(db, { expenseDate: "2026-08-30", description: "إيجار مصنع", amount: 5000, paymentStatus: "paid", safeId: mainSafe, createdBy: adminId });
createSafeTransfer(db, { transferDate: "2026-08-30", fromSafeId: mainSafe, toSafeId: subSafe, amount: 3000, createdBy: adminId });
createCapitalTransaction(db, { transactionDate: "2026-08-30", transactionType: "capital_injection", safeId: mainSafe, amount: 10000, createdBy: adminId });
console.log("Expense, transfer, capital done");

console.log("\nDEV DB READY at:", process.env.DATABASE_PATH);
console.log("Login: admin / Admin_12345");
console.log("Customers: علاء بوم ارض النت has invoice SI with remaining 1150");
console.log("Materials: شطرنج اسود avg 195, سمر ميلتون 310, انترلوك 390");
console.log("Production: PB-00001 cost per piece 364.5");

closeDatabase();
