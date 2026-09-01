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
  { id: "size-xl", name: "XL", sortOrder: 40 },
  { id: "size-xxl", name: "XXL", sortOrder: 50 },
  { id: "size-3xl", name: "3XL", sortOrder: 60 }
];

const defaultColors = [
  { id: "color-unspecified", name: "Unspecified", sortOrder: 0 },
  { id: "color-white", name: "White", sortOrder: 10 },
  { id: "color-black", name: "Black", sortOrder: 20 },
  { id: "color-navy", name: "Navy", sortOrder: 30 },
  { id: "color-blue", name: "Blue", sortOrder: 40 },
  { id: "color-red", name: "Red", sortOrder: 50 },
  { id: "color-grey", name: "Grey", sortOrder: 60 },
  { id: "color-beige", name: "Beige", sortOrder: 70 }
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
  { id: "ec-transport", name: "Transport", isOverhead: false },
  { id: "ec-packaging", name: "Packaging & Shipping", isOverhead: false }
];

const defaultSafes = [
  { id: "safe-main", name: "الخزينة الرئيسية (Main Safe)", opening: 5000000, current: 5000000 },
  { id: "safe-bank", name: "حساب بنك مصر (Banque Misr)", opening: 10000000, current: 10000000 }
];

const defaultOwners = [
  { id: "owner-1", name: "أحمد الشريك (Ahmed Partner)", percent: 60 },
  { id: "owner-2", name: "محمود الشريك (Mahmoud Partner)", percent: 40 }
];

const defaultSuppliers = [
  {
    id: "sup-1",
    name: "شركة الأمل لتجارة الأقمشة (Al-Amal Textiles)",
    contactName: "أ/ سامح",
    phone: "01012345678",
    address: "المحلة الكبرى",
    notes: "مورد رئيسي للأقمشة القطنية"
  },
  {
    id: "sup-2",
    name: "مصنع خيوط النيل (Nile Threads)",
    contactName: "م/ كريم",
    phone: "01198765432",
    address: "شبين الكوم",
    notes: "مورد خيوط ومستلزمات خياطة"
  },
  {
    id: "sup-3",
    name: "مؤسسة الأهرام للإكسسوارات (Al-Ahram Accessories)",
    contactName: "أ/ هاني",
    phone: "01234567890",
    address: "القاهرة",
    notes: "مورد أزرار وسوست وتغليف"
  }
];

const defaultCustomers = [
  {
    id: "cust-1",
    companyName: "محلات الأناقة للملابس (Al-Anaqa Stores)",
    contactName: "أ/ طارق",
    phone: "01099887766",
    address: "مدينة نصر، القاهرة",
    notes: "عميل جملة ملابس رجالي"
  },
  {
    id: "cust-2",
    companyName: "سلسلة محلات جولدن فاشون (Golden Fashion)",
    contactName: "أ/ حسام",
    phone: "01122334455",
    address: "سموحة، الإسكندرية",
    notes: "عميل تجزئة ملابس شبابي"
  },
  {
    id: "cust-3",
    companyName: "شركة النخبة للتوزيع (Al-Nokhba Distribution)",
    contactName: "م/ أيمن",
    phone: "01288776655",
    address: "المنصورة",
    notes: "موزع رئيسي بالدلتا"
  }
];

const defaultMaterials = [
  {
    id: "mat-1",
    name: "قماش قطن 100% - أبيض (Cotton 100% White)",
    colorName: "White",
    unit: "meter",
    quantity: 500,
    costMinor: 12000,
    supplierId: "sup-1"
  },
  {
    id: "mat-2",
    name: "قماش جينز تركي - كحلي (Turkish Denim Navy)",
    colorName: "Navy",
    unit: "meter",
    quantity: 350,
    costMinor: 18000,
    supplierId: "sup-1"
  },
  {
    id: "mat-3",
    name: "قماش بوليستر مخلوط - أسود (Poly-Blend Black)",
    colorName: "Black",
    unit: "meter",
    quantity: 400,
    costMinor: 9500,
    supplierId: "sup-1"
  },
  {
    id: "mat-4",
    name: "بكرة خيط خياطة عالي الجودة - أبيض (Sewing Thread White)",
    colorName: "White",
    unit: "piece",
    quantity: 100,
    costMinor: 2500,
    supplierId: "sup-2"
  },
  {
    id: "mat-5",
    name: "أزرار قمصان كلاسيك مقاس 18 (Buttons 18mm)",
    colorName: "White",
    unit: "piece",
    quantity: 5000,
    costMinor: 50,
    supplierId: "sup-3"
  },
  {
    id: "mat-6",
    name: "سوستة نحاس 20 سم (Brass Zipper 20cm)",
    colorName: "Navy",
    unit: "piece",
    quantity: 300,
    costMinor: 1500,
    supplierId: "sup-3"
  }
];

const defaultModels = [
  {
    id: "mod-1",
    modelCode: "SH-001",
    modelName: "قميص رجالي كلاسيك قطن (Classic Cotton Shirt)",
    mainMaterialId: "mat-1",
    description: "قميص كلاسيك فاخر قطن مصري 100%"
  },
  {
    id: "mod-2",
    modelCode: "JK-002",
    modelName: "جاكيت جينز عصري (Modern Denim Jacket)",
    mainMaterialId: "mat-2",
    description: "جاكيت جينز ثقيل شبابي خريفي"
  },
  {
    id: "mod-3",
    modelCode: "TS-003",
    modelName: "تيشيرت بولو كاجوال (Casual Polo T-Shirt)",
    mainMaterialId: "mat-3",
    description: "تيشيرت بولو مناسب للاستخدام اليومي"
  }
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
        INSERT OR IGNORE INTO users (id, username, display_name, password_hash, role_id)
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
      INSERT OR IGNORE INTO document_sequences (id, document_type, prefix, next_number, padding)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [documentType, prefix, nextNumber, padding] of sequences) {
      insertSequence.run(randomUUID(), documentType, prefix, nextNumber, padding);
    }

    db.prepare(`
      INSERT OR IGNORE INTO app_settings (key, value_json)
      VALUES ('locale', '{"language":"ar","direction":"rtl"}')
    `).run();

    const insertSize = db.prepare(`
      INSERT OR IGNORE INTO sizes (id, name, sort_order, is_active)
      VALUES (@id, @name, @sortOrder, 1)
    `);
    for (const size of defaultSizes) {
      insertSize.run(size);
    }

    const insertColor = db.prepare(`
      INSERT OR IGNORE INTO colors (id, name, sort_order, is_active)
      VALUES (@id, @name, @sortOrder, 1)
    `);
    for (const color of defaultColors) {
      insertColor.run(color);
    }

    const insertPaymentMethod = db.prepare(`
      INSERT OR IGNORE INTO payment_methods (id, name, is_active)
      VALUES (@id, @name, 1)
    `);
    for (const method of defaultPaymentMethods) {
      insertPaymentMethod.run(method);
    }

    const insertExpenseCategory = db.prepare(`
      INSERT OR IGNORE INTO expense_categories (id, name, is_overhead, is_active)
      VALUES (@id, @name, @isOverhead, 1)
    `);
    for (const category of defaultExpenseCategories) {
      insertExpenseCategory.run({
        ...category,
        isOverhead: category.isOverhead ? 1 : 0
      });
    }

    // Seed Safes
    const insertSafe = db.prepare(`
      INSERT OR IGNORE INTO safes (id, name, opening_balance_minor, current_balance_minor, is_active)
      VALUES (@id, @name, @opening, @current, 1)
    `);
    for (const safe of defaultSafes) {
      insertSafe.run(safe);
    }

    // Seed Owners
    const insertOwner = db.prepare(`
      INSERT OR IGNORE INTO owners (id, name, ownership_percent, is_active)
      VALUES (@id, @name, @percent, 1)
    `);
    for (const owner of defaultOwners) {
      insertOwner.run(owner);
    }

    // Seed Suppliers
    const insertSupplier = db.prepare(`
      INSERT OR IGNORE INTO suppliers (id, name, contact_name, phone, address, notes, is_active)
      VALUES (@id, @name, @contactName, @phone, @address, @notes, 1)
    `);
    for (const supplier of defaultSuppliers) {
      insertSupplier.run(supplier);
    }

    // Seed Customers
    const insertCustomer = db.prepare(`
      INSERT OR IGNORE INTO customers (id, company_name, contact_name, phone, address, notes, is_active)
      VALUES (@id, @companyName, @contactName, @phone, @address, @notes, 1)
    `);
    for (const customer of defaultCustomers) {
      insertCustomer.run(customer);
    }

    // Seed Materials
    const insertMaterial = db.prepare(`
      INSERT OR IGNORE INTO materials (id, name, color_name, unit, current_quantity, weighted_average_cost_minor, supplier_id, is_active)
      VALUES (@id, @name, @colorName, @unit, @quantity, @costMinor, @supplierId, 1)
    `);
    for (const material of defaultMaterials) {
      insertMaterial.run(material);
    }

    // Seed Models
    const insertModel = db.prepare(`
      INSERT OR IGNORE INTO models (id, model_code, model_name, main_material_id, description, is_active)
      VALUES (@id, @modelCode, @modelName, @mainMaterialId, @description, 1)
    `);
    for (const model of defaultModels) {
      insertModel.run(model);
    }

    // Seed Model Variants
    const insertVariant = db.prepare(`
      INSERT OR IGNORE INTO model_variants (id, model_id, size_id, color_id, current_quantity, current_average_cost_minor, is_active)
      VALUES (@id, @modelId, @sizeId, @colorId, @qty, @cost, 1)
    `);

    // Fetch existing sizes and colors from database to ensure valid foreign keys
    const dbSizes = db.prepare("SELECT id FROM sizes WHERE id IN ('size-m', 'size-l', 'size-xl')").all() as { id: string }[];
    const dbColors = db.prepare("SELECT id FROM colors WHERE id IN ('color-white', 'color-black', 'color-navy')").all() as { id: string }[];

    for (const model of defaultModels) {
      for (const s of dbSizes) {
        for (const c of dbColors) {
          insertVariant.run({
            id: `var-${model.modelCode.toLowerCase()}-${s.id}-${c.id}`,
            modelId: model.id,
            sizeId: s.id,
            colorId: c.id,
            qty: 25,
            cost: 25000 // 250.00 EGP
          });
        }
      }
    }
  });

  runSeed();
  console.log("Seed completed. Default admin username:", env.defaultAdminUsername);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed();
}
