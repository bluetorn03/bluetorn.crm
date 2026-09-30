import mysql from "mysql2/promise";
import fs from "node:fs";

if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf-8").split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#") && t.includes("=")) {
      const idx = t.indexOf("=");
      const k = t.slice(0, idx).trim();
      const v = t
        .slice(idx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME || "bluetorn_crm",
  decimalNumbers: true,
});

async function main() {
  console.log("=== Repairing Inconsistent Invoice & Item Financial Data ===");

  // 1. Repair invoice_items where tax_rate = 0 but invoice has tax_rate > 0 and tax_amount > 0
  const [itemResult] = await pool.query(`
    UPDATE invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    SET 
      ii.tax_rate = i.tax_rate,
      ii.tax_amount = ROUND((ii.rate * ii.quantity - ii.discount) * i.tax_rate / 100, 2),
      ii.line_total = ROUND((ii.rate * ii.quantity - ii.discount) * (1 + i.tax_rate / 100), 2),
      ii.amount = ROUND((ii.rate * ii.quantity - ii.discount) * (1 + i.tax_rate / 100), 2)
    WHERE i.tax_rate > 0 
      AND i.tax_amount > 0 
      AND ii.tax_rate = 0 
      AND ii.tax_amount = 0
  `);
  console.log("Invoice items repaired:", itemResult.affectedRows);

  // 2. Repair invoices where taxable_amount = 0 but subtotal > 0
  const [invResult] = await pool.query(`
    UPDATE invoices i
    JOIN workspaces w ON i.workspace_id = w.id
    SET 
      i.taxable_amount = GREATEST(0, i.subtotal - i.discount),
      i.cgst = CASE 
        WHEN (w.state_code IS NOT NULL AND i.place_of_supply IS NOT NULL AND UPPER(TRIM(i.place_of_supply)) != UPPER(TRIM(w.state_code))) THEN 0 
        ELSE ROUND(i.tax_amount / 2, 2) 
      END,
      i.sgst = CASE 
        WHEN (w.state_code IS NOT NULL AND i.place_of_supply IS NOT NULL AND UPPER(TRIM(i.place_of_supply)) != UPPER(TRIM(w.state_code))) THEN 0 
        ELSE ROUND(i.tax_amount / 2, 2) 
      END,
      i.igst = CASE 
        WHEN (w.state_code IS NOT NULL AND i.place_of_supply IS NOT NULL AND UPPER(TRIM(i.place_of_supply)) != UPPER(TRIM(w.state_code))) THEN i.tax_amount 
        ELSE 0 
      END
    WHERE i.taxable_amount = 0 AND i.subtotal > 0
  `);
  console.log("Invoices repaired:", invResult.affectedRows);

  // Verification
  const [invs] = await pool.query(
    "SELECT id, invoice_number, status, subtotal, discount, taxable_amount, cgst, sgst, igst, tax_amount, total, tax_rate FROM invoices",
  );
  console.log("\n--- VERIFIED INVOICES ---");
  for (const inv of invs) {
    console.log(
      `${inv.invoice_number} (${inv.status}): Subtotal=${inv.subtotal}, Taxable=${inv.taxable_amount}, CGST=${inv.cgst}, SGST=${inv.sgst}, IGST=${inv.igst}, Tax=${inv.tax_amount}, Total=${inv.total}`,
    );
  }

  const [items] = await pool.query(
    "SELECT id, invoice_id, description, quantity, rate, discount, tax_rate, tax_amount, line_total, amount FROM invoice_items",
  );
  console.log("\n--- VERIFIED ITEMS ---");
  for (const it of items) {
    console.log(
      `Item for ${it.invoice_id}: Rate=${it.rate}, TaxRate=${it.tax_rate}%, TaxAmt=${it.tax_amount}, LineTotal=${it.line_total}`,
    );
  }

  await pool.end();
}

main().catch(console.error);
