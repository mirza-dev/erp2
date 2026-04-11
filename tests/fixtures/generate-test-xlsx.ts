/**
 * Generates tests/fixtures/test-import.xlsx
 * Run: npx tsx tests/fixtures/generate-test-xlsx.ts
 */
import * as XLSX from "xlsx";
import path from "path";

const wb = XLSX.utils.book_new();

// ── Sheet 1: Urunler ──────────────────────────────────────────────��──────────
const products = [
    { "Ürün Kodu": "IMP-001", "Ürün Adı": "Test Vanası A", "Birim": "adet", "Fiyat": "150,00",    "Min. Stok": "5" },
    { "Ürün Kodu": "IMP-002", "Ürün Adı": "Test Vanası B", "Birim": "adet", "Fiyat": "1.200,50",  "Min. Stok": "3" },
    { "Ürün Kodu": "IMP-003", "Ürün Adı": "Test Flanş",    "Birim": "adet", "Fiyat": "75,00",     "Min. Stok": "10" },
    { "Ürün Kodu": "IMP-004", "Ürün Adı": "Test Conta",    "Birim": "kg",   "Fiyat": "45,25",     "Min. Stok": "20" },
    { "Ürün Kodu": "IMP-005", "Ürün Adı": "Test Boru",     "Birim": "m",    "Fiyat": "320,00",    "Min. Stok": "15" },
];
const wsProducts = XLSX.utils.json_to_sheet(products);
XLSX.utils.book_append_sheet(wb, wsProducts, "Urunler");

// ── Sheet 2: Musteriler ───────────────────────────────��───────────────────────
const customers = [
    { "Firma Adı": "Test Firma Alpha", "E-posta": "alpha@test.com",  "Ülke": "TR", "Para Birimi": "USD" },
    { "Firma Adı": "Test Firma Beta",  "E-posta": "beta@test.com",   "Ülke": "DE", "Para Birimi": "EUR" },
    { "Firma Adı": "Test Firma Gamma", "E-posta": "gamma@test.com",  "Ülke": "US", "Para Birimi": "USD" },
];
const wsCustomers = XLSX.utils.json_to_sheet(customers);
XLSX.utils.book_append_sheet(wb, wsCustomers, "Musteriler");

// ── Sheet 3: Stok ────────────────────────────────────────────────��────────────
const stock = [
    { "SKU": "IMP-001", "Stok Miktarı": 25 },
    { "SKU": "IMP-002", "Stok Miktarı": 8  },
    { "SKU": "IMP-003", "Stok Miktarı": 50 },
];
const wsStock = XLSX.utils.json_to_sheet(stock);
XLSX.utils.book_append_sheet(wb, wsStock, "Stok");

// ── Write file ────────────────────────────────────────────────────────────────
const outputPath = path.join(__dirname, "test-import.xlsx");
XLSX.writeFile(wb, outputPath);
console.log(`✓ Generated: ${outputPath}`);
