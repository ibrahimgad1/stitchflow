import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDatabase, closeDatabase } from "../backend/src/database/connection.js";
import { migrate } from "../backend/src/database/migrate.js";
import { seed } from "../backend/src/database/seed.js";
import { createMaterialReceiving } from "../backend/src/services/purchasing.js";
import { createProductionBatch, startProductionBatch, completeProductionBatch, getProductionCostSummary } from "../backend/src/services/production.js";
import { createSalesInvoice, confirmSalesInvoice, createCustomerPayment } from "../backend/src/services/sales.js";
import { createExpense, createSafeTransfer, createCapitalTransaction } from "../backend/src/services/treasury.js";
import { createSupplierPayment } from "../backend/src/services/purchasing.js";
import { loadEnv } from "../backend/src/config/env.js";
import { randomUUID } from "crypto";

// Use temp DB for isolated test
import fs from "fs";
import os from "os";
import path from "path";
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "full-flow-"));
process.env.DATABASE_PATH = path.join(tmpDir, "fullflow.db");
console.log("DB:", process.env.DATABASE_PATH);

migrate();
seed();
const db = getDatabase();

// ensure admin
const env = loadEnv();
const admin = db.prepare("SELECT id FROM users WHERE username=?").get(env.defaultAdminUsername) as any;
const adminId = admin.id;

// helper
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
  const minor = Math.round(opening*100);
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

console.log("\n=== PHASE 3: Master Data from Excel ===");
// Customers from ششش sheets
const customers = [
  "علاء بوم ارض النت",
  "4K حموده",
  "مكتب القاضي",
  "الاتشو",
  "POINT زفتي (جديد)"
].map(n => ({ name: n, id: createCustomer(n)}));
console.log("Customers:", customers.map(c=>c.name));

// Suppliers from المخزن قماش
const suppliers = [
  { name: "عبود", id: createSupplier("عبود") },
  { name: "غياث", id: createSupplier("غياث") },
  { name: "غياس تراب", id: createSupplier("غياس تراب") },
];
console.log("Suppliers:", suppliers.map(s=>s.name));

// Materials from المخزن قماش - type + color
const mat1 = createMaterial("شطرنج اسود", "meter", suppliers[0].id);
const mat2 = createMaterial("سمر ميلتون شانيه", "meter", suppliers[1].id);
const mat3 = createMaterial("انترلوك اسود", "meter", suppliers[1].id);
const mat4 = createMaterial("سمر ميلتون فوطه اسود", "meter", suppliers[2].id);
console.log("Materials IDs:", mat1, mat2);

// Safes - from تجميعة الفواتير initial 73340
const mainSafe = createSafe("الخزنة الرئيسية", 50000);
const subSafe = createSafe("خزنة فرعية", 10000);
console.log("Safes:", mainSafe, subSafe);

// Models from شغل البيع + B110 sheet
const modelB01 = createModel("B01", "شروال سمر ميلتون جوردن");
const modelB02 = createModel("B02", "شروال وايد ليج بالنسياجا انتر لوك");
const modelB110 = createModel("B110", "شروال قصات انترلوك");
const modelB03 = createModel("B03", "شروال سمر ميلتون اوفر سايز");
console.log("Models:", modelB01, modelB02);

// Variants - using seeded sizes/colors
// Ensure sizes/colors exist: size-m, color-white/black etc
const varB01_M_White = createVariant(modelB01, "size-m", "color-white");
const varB02_L_Black = createVariant(modelB02, "size-l", "color-black");
const varB110_M_Black = createVariant(modelB110, "size-m", "color-black");
const varB03_M_White = createVariant(modelB03, "size-m", "color-white");
console.log("Variants created");

// Verify
const matCheck = db.prepare("SELECT name, current_quantity, weighted_average_cost_minor FROM materials").all();
console.log("Materials initial:", matCheck);

console.log("\n=== PHASE 4: Purchasing (المخزن قماش) ===");
// Receiving 1: شطرنج اسود 41.9 *195 =8170.5 from عبود (as per Excel row 3)
const recv1 = createMaterialReceiving(db, {
  supplierId: suppliers[0].id,
  receivingDate: "2026-08-29",
  items: [{ materialId: mat1, quantity: 41.9, unitPrice: 195 }],
  createdBy: adminId
});
console.log("Receiving1 شطرنج اسود 41.9@195 =>", recv1, "total", recv1.totalMinor/100);

// Receiving 2: سمر ميلتون شانيه 22.8*310=7068 from غياث
const recv2 = createMaterialReceiving(db, {
  supplierId: suppliers[1].id,
  receivingDate: "2026-08-29",
  items: [{ materialId: mat2, quantity: 22.8, unitPrice: 310 }],
  createdBy: adminId
});
console.log("Receiving2 سمر ميلتون شانيه 22.8@310 =>", recv2);

// Receiving 3: انترلوك اسود 54*390=21060 (from Excel)
const recv3 = createMaterialReceiving(db, {
  supplierId: suppliers[1].id,
  receivingDate: "2026-08-29",
  items: [{ materialId: mat3, quantity: 54, unitPrice: 390 }],
  createdBy: adminId
});
console.log("Receiving3 انترلوك 54@390 =>", recv3);

// Check weighted avg
const matsAfter = db.prepare("SELECT name, current_quantity, weighted_average_cost_minor FROM materials").all() as any[];
console.log("Materials after receivings:", matsAfter.map(m=> `${m.name} qty=${m.current_quantity} avg=${m.weighted_average_cost_minor/100}`));

// Supplier payables
const supLedgers = suppliers.map(s=>{
  const bal = db.prepare("SELECT balance_after_minor FROM supplier_ledger_entries WHERE supplier_id=? ORDER BY rowid DESC LIMIT 1").get(s.id) as any;
  return { supplier: s.name, balance: bal?.balance_after_minor/100 ?? 0 };
});
console.log("Supplier payables:", supLedgers);

// Supplier payment partial
const supPay = createSupplierPayment(db, {
  supplierId: suppliers[0].id,
  paymentDate: "2026-08-30",
  amount: 5000,
  safeId: mainSafe,
  allocations: [{ materialReceivingId: recv1.id, allocatedAmount: 5000 }],
  createdBy: adminId
});
console.log("Supplier payment 5000 to عبود =>", supPay);
const safeAfterPay = db.prepare("SELECT current_balance_minor FROM safes WHERE id=?").get(mainSafe) as any;
console.log("Main safe after supplier pay:", safeAfterPay.current_balance_minor/100);
const supBalAfter = db.prepare("SELECT balance_after_minor FROM supplier_ledger_entries WHERE supplier_id=? ORDER BY rowid DESC LIMIT 1").get(suppliers[0].id) as any;
console.log("عبود balance after pay:", supBalAfter.balance_after_minor/100);

console.log("\n=== PHASE 5: Production (B110 cost sheet) ===");
// B110 cost per Excel: إجمالي 23842 for 76 pieces => ~313.7 per piece raw+overhead
// Simulate production batch for B02 using شطرنج اسود
const batch = createProductionBatch(db, {
  modelId: modelB02,
  plannedQuantity: 91, // from ششش stock total for B02 91
  consumptions: [{ materialId: mat1, quantity: 20 }],
  outputs: [{ modelVariantId: varB02_L_Black, goodQuantity: 20 }],
  costComponents: [
    { componentName: "قص", amount: 230 },
    { componentName: "باترون", amount: 500 },
    { componentName: "مصنعية", amount: 2280 },
    { componentName: "تشطيب", amount: 380 },
  ],
  createdBy: adminId
});
console.log("Batch created PB:", batch.batchNumber);
startProductionBatch(db, batch.id, "2026-08-29");
const complete = completeProductionBatch(db, batch.id, {
  completedDate: "2026-08-30",
  goodQuantity: 20,
  damagedQuantity: 1,
  wastedQuantity: 0,
  createdBy: adminId
});
console.log("Batch completed:", complete, "per piece", complete.costPerGoodPieceMinor/100);
const summary = getProductionCostSummary(db, batch.id);
console.log("Cost summary material:", summary.materialCostMinor/100, "components", summary.componentCostMinor/100, "direct", summary.directCostMinor/100);
const varStock = db.prepare("SELECT current_quantity, current_average_cost_minor FROM model_variants WHERE id=?").get(varB02_L_Black) as any;
console.log("Variant B02 L/Black stock:", varStock.current_quantity, "avg cost", varStock.current_average_cost_minor/100);
const matAfterProd = db.prepare("SELECT current_quantity FROM materials WHERE id=?").get(mat1) as any;
console.log("Material شطرنج اسود after consumption:", matAfterProd.current_quantity);

// Second batch for B01
const batch2 = createProductionBatch(db, {
  modelId: modelB01,
  plannedQuantity: 20,
  consumptions: [{ materialId: mat2, quantity: 10 }],
  outputs: [{ modelVariantId: varB01_M_White, goodQuantity: 15 }],
  costComponents: [{ componentName: "مصنعية B01", amount: 1000 }],
  createdBy: adminId
});
startProductionBatch(db, batch2.id);
completeProductionBatch(db, batch2.id, { completedDate: "2026-08-30", goodQuantity: 15, createdBy: adminId });
console.log("Batch2 B01 completed");

console.log("\n=== PHASE 6: Sales (ششش / شغل البيع) ===");
// Sale to علاء بوم ارض النت as per first Excel: B02 16*380=6080 etc but simplify
const invoice = createSalesInvoice(db, {
  customerId: customers[0].id,
  invoiceDate: "2026-08-30",
  items: [
    { modelVariantId: varB02_L_Black, quantity: 5, unitPrice: 370 }, // شغل البيع B02 سعر 370
    { modelVariantId: varB01_M_White, quantity: 4, unitPrice: 325 },
  ],
  createdBy: adminId
});
console.log("Draft invoice:", invoice.invoiceNumber, invoice.totalMinor/100);
const confirmed = confirmSalesInvoice(db, { salesInvoiceId: invoice.id, confirmedBy: adminId });
console.log("Confirmed invoice costOfGoods:", confirmed.costOfGoodsMinor/100, "gross", confirmed.grossProfitMinor/100);
const varAfterSale = db.prepare("SELECT current_quantity FROM model_variants WHERE id=?").get(varB02_L_Black) as any;
console.log("Variant B02 stock after sale 5:", varAfterSale.current_quantity);
const custBal = db.prepare("SELECT balance_after_minor FROM customer_ledger_entries WHERE customer_id=? ORDER BY rowid DESC LIMIT 1").get(customers[0].id) as any;
console.log("Customer علاء balance (receivable):", custBal.balance_after_minor/100);
const invoiceRow = db.prepare("SELECT remaining_minor, paid_minor FROM sales_invoices WHERE id=?").get(invoice.id) as any;
console.log("Invoice remaining:", invoiceRow.remaining_minor/100, "paid", invoiceRow.paid_minor/100);

// Customer payment partial
const custPay = createCustomerPayment(db, {
  customerId: customers[0].id,
  paymentDate: "2026-08-30",
  amount: 2000,
  safeId: mainSafe,
  allocations: [{ salesInvoiceId: invoice.id, allocatedAmount: 2000 }],
  createdBy: adminId
});
console.log("Customer payment 2000 allocated:", custPay.paymentNumber);
const safeAfterCustPay = db.prepare("SELECT current_balance_minor FROM safes WHERE id=?").get(mainSafe) as any;
console.log("Main safe after cust pay:", safeAfterCustPay.current_balance_minor/100);
const custBal2 = db.prepare("SELECT balance_after_minor FROM customer_ledger_entries WHERE customer_id=? ORDER BY rowid DESC LIMIT 1").get(customers[0].id) as any;
console.log("Customer balance after pay:", custBal2.balance_after_minor/100);

console.log("\n=== PHASE 7: Expenses / Treasury ===");
const exp = createExpense(db, {
  expenseDate: "2026-08-30",
  description: "إيجار مصنع",
  amount: 5000,
  paymentStatus: "paid",
  safeId: mainSafe,
  createdBy: adminId
});
console.log("Expense paid 5000:", exp.expenseNumber);
const safeAfterExp = db.prepare("SELECT current_balance_minor FROM safes WHERE id=?").get(mainSafe) as any;
console.log("Safe after expense:", safeAfterExp.current_balance_minor/100);

const transfer = createSafeTransfer(db, {
  transferDate: "2026-08-30",
  fromSafeId: mainSafe,
  toSafeId: subSafe,
  amount: 3000,
  createdBy: adminId
});
console.log("Transfer 3000 main->sub:", transfer.transferNumber);
console.log("Main safe:", (db.prepare("SELECT current_balance_minor FROM safes WHERE id=?").get(mainSafe) as any).current_balance_minor/100);
console.log("Sub safe:", (db.prepare("SELECT current_balance_minor FROM safes WHERE id=?").get(subSafe) as any).current_balance_minor/100);

const capital = createCapitalTransaction(db, {
  transactionDate: "2026-08-30",
  transactionType: "capital_injection",
  safeId: mainSafe,
  amount: 10000,
  createdBy: adminId
});
console.log("Capital injection 10000:", capital.id);

console.log("\n=== PHASE 8: Reports ===");
const dash = {
  receivables: (db.prepare("SELECT COALESCE(SUM(remaining_minor),0) as v FROM sales_invoices WHERE status='confirmed'").get() as any).v/100,
  payables: (db.prepare("SELECT COALESCE(SUM(remaining_minor),0) as v FROM material_receivings WHERE status='confirmed'").get() as any).v/100,
  treasury: (db.prepare("SELECT COALESCE(SUM(current_balance_minor),0) as v FROM safes WHERE is_active=1").get() as any).v/100,
  rawValue: (db.prepare("SELECT COALESCE(SUM(current_quantity * weighted_average_cost_minor),0) as v FROM materials").get() as any).v/100,
  finishedQty: (db.prepare("SELECT COALESCE(SUM(current_quantity),0) as v FROM model_variants").get() as any).v,
  salesRevenue: (db.prepare("SELECT COALESCE(SUM(total_minor),0) as v FROM sales_invoices WHERE status='confirmed'").get() as any).v/100,
};
console.log("Dashboard:", dash);

const stockRaw = db.prepare("SELECT name, current_quantity, weighted_average_cost_minor FROM materials").all();
console.log("Raw stock:", stockRaw);
const stockFinished = db.prepare("SELECT mv.current_quantity, mv.current_average_cost_minor, m.model_code FROM model_variants mv JOIN models m ON m.id=mv.model_id").all();
console.log("Finished stock:", stockFinished);

const ledgerCust = db.prepare("SELECT debit_minor, credit_minor, balance_after_minor, description FROM customer_ledger_entries WHERE customer_id=? ORDER BY rowid").all(customers[0].id);
console.log("Customer ledger entries:", ledgerCust);
const ledgerSup = db.prepare("SELECT debit_minor, credit_minor, balance_after_minor, description FROM supplier_ledger_entries WHERE supplier_id=? ORDER BY rowid").all(suppliers[0].id);
console.log("Supplier ledger عبود:", ledgerSup);
const safeTx = db.prepare("SELECT transaction_type, direction, amount_minor, balance_after_minor, description FROM safe_transactions WHERE safe_id=? ORDER BY rowid").all(mainSafe);
console.log("Safe transactions main:", safeTx.slice(0,10));

console.log("\n=== Verification Summary ===");
let ok = true;
function assert(name: string, cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL ${name}: ${msg}`); ok=false; } else console.log(`PASS ${name}`);
}
assert("Weighted avg updated", matsAfter[0].weighted_average_cost_minor>0, "avg should >0");
assert("Supplier payable reduced by payment", supBalAfter.balance_after_minor < (supLedgers[0].balance*100), "payable not reduced");
assert("Safe decreased by supplier pay", safeAfterPay.current_balance_minor < 5000000, "safe not decreased");
assert("Variant stock after production", varStock.current_quantity===20, "variant stock 20");
assert("Material consumed", matAfterProd.current_quantity < 41.9, "material not consumed");
assert("Invoice receivable created", custBal.balance_after_minor>0, "receivable 0");
assert("Customer payment reduced receivable", custBal2.balance_after_minor < custBal.balance_after_minor, "receivable not reduced");
assert("Safe increased by cust pay", safeAfterCustPay.current_balance_minor > safeAfterPay.current_balance_minor, "safe not increased");
assert("Expense decreased safe", safeAfterExp.current_balance_minor < safeAfterCustPay.current_balance_minor, "expense not deducted");
assert("Transfer atomic", (db.prepare("SELECT current_balance_minor FROM safes WHERE id=?").get(subSafe) as any).current_balance_minor === 1300000, "transfer failed");

console.log("\n=== FULL FLOW", ok ? "PASSED" : "FAILED", "===");
closeDatabase();
