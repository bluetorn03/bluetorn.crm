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
  const [invs] = await pool.query(
    "SELECT id, invoice_number, status, subtotal, discount, taxable_amount, cgst, sgst, igst, tax_amount, total, tax_rate FROM invoices",
  );
  console.log("INVOICES count:", invs.length);
  console.log("INVOICES:", JSON.stringify(invs, null, 2));

  const [items] = await pool.query(
    "SELECT id, invoice_id, description, quantity, rate, discount, tax_rate, tax_amount, line_total, amount FROM invoice_items",
  );
  console.log("ITEMS count:", items.length);
  console.log("ITEMS:", JSON.stringify(items, null, 2));

  const [workspaces] = await pool.query("SELECT id, code, name, status FROM workspaces LIMIT 5");
  console.log("WORKSPACES:", workspaces);
  const [profiles] = await pool.query(
    "SELECT id, workspace_id, user_code, full_name, email FROM profiles LIMIT 5",
  );
  console.log("PROFILES:", profiles);

  await pool.end();
}

main().catch(console.error);
