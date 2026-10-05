import mysql from "mysql2/promise";
import { convertIstDateToUtcBounds } from "../src/lib/format.ts";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || "bluetorn_crm",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
});

async function main() {
  const wsId = "3419bb7e-7c17-4baa-a929-3e7c4a991542";
  const [dates] = await pool.query(
    "SELECT DATE(created_at) as d, count(*) as c FROM audit_logs WHERE workspace_id = ? GROUP BY DATE(created_at) ORDER BY d DESC",
    [wsId]
  );
  console.log("Audit log dates in ws 3419bb7e-7c17-4baa-a929-3e7c4a991542:", dates);

  // Let's test From only: 2026-10-01
  const fromDate = "2026-10-01";
  const fromUtc = convertIstDateToUtcBounds(fromDate, false);
  console.log("From 2026-10-01 UTC bound:", fromUtc);

  const [fromOnlyRows] = await pool.query(
    "SELECT id, action, created_at FROM audit_logs WHERE workspace_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 5",
    [wsId, fromUtc]
  );
  console.log("From only 2026-10-01 first 5 rows:", fromOnlyRows);

  // Let's test From 2026-10-01 to 2026-10-03
  const toDate = "2026-10-03";
  const toUtc = convertIstDateToUtcBounds(toDate, true);
  console.log("To 2026-10-03 UTC bound:", toUtc);

  const [rangeRows] = await pool.query(
    "SELECT id, action, created_at FROM audit_logs WHERE workspace_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT 5",
    [wsId, fromUtc, toUtc]
  );
  console.log("From 2026-10-01 to 2026-10-03 rows count:", rangeRows.length, rangeRows);

  // Let's check all workspaces and their users
  const [users] = await pool.query("SELECT id, email, full_name, role, workspace_id FROM profiles");
  console.log("Profiles:", users);

  await pool.end();
}

main().catch(console.error);
