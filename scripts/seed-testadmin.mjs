import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  database: process.env.MYSQL_DATABASE || "bluetorn_crm",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 5,
});

function uuid() {
  return crypto.randomUUID();
}

async function main() {
  const wsCode = "TESTADMIN";
  const [wsRows] = await pool.query("SELECT id FROM workspaces WHERE code = ?", [wsCode]);
  let wsId = wsRows[0]?.id;

  if (!wsId) {
    wsId = uuid();
    await pool.query(
      "INSERT INTO workspaces (id, name, code, currency, plan, status, seat_limit, created_at) VALUES (?, ?, ?, 'INR', 'Enterprise', 'active', 50, NOW())",
      [wsId, "Test Admin Workspace", wsCode],
    );
    console.log("Created workspace TESTADMIN:", wsId);
  } else {
    console.log("Found workspace TESTADMIN:", wsId);
  }

  const pwHash = await bcrypt.hash("testadmin", 10);

  // Owner: test.admin
  const [ownerRows] = await pool.query("SELECT id FROM profiles WHERE user_code = ?", ["test.admin"]);
  if (!ownerRows[0]) {
    const ownerId = uuid();
    await pool.query(
      "INSERT INTO profiles (id, workspace_id, user_code, full_name, email, password_hash, job_title, is_active) VALUES (?, ?, 'test.admin', 'Test Admin (Owner)', 'test.admin@bluetorn.test', ?, 'Director', 1)",
      [ownerId, wsId, pwHash],
    );
    await pool.query(
      "INSERT INTO user_roles (id, user_id, workspace_id, role) VALUES (?, ?, ?, 'owner')",
      [uuid(), ownerId, wsId],
    );
    console.log("Created owner test.admin:", ownerId);
  } else {
    await pool.query("UPDATE profiles SET workspace_id = ?, password_hash = ? WHERE id = ?", [
      wsId,
      pwHash,
      ownerRows[0].id,
    ]);
    console.log("Updated owner test.admin:", ownerRows[0].id);
  }

  // Employee: test.pratik
  const [empRows] = await pool.query("SELECT id FROM profiles WHERE user_code = ?", ["test.pratik"]);
  if (!empRows[0]) {
    const empId = uuid();
    await pool.query(
      "INSERT INTO profiles (id, workspace_id, user_code, full_name, email, password_hash, job_title, is_active) VALUES (?, ?, 'test.pratik', 'Pratik (Sales Executive)', 'test.pratik@bluetorn.test', ?, 'Sales Agent', 1)",
      [empId, wsId, pwHash],
    );
    await pool.query(
      "INSERT INTO user_roles (id, user_id, workspace_id, role) VALUES (?, ?, ?, 'employee')",
      [uuid(), empId, wsId],
    );
    console.log("Created employee test.pratik:", empId);
  } else {
    await pool.query("UPDATE profiles SET workspace_id = ?, password_hash = ? WHERE id = ?", [
      wsId,
      pwHash,
      empRows[0].id,
    ]);
    console.log("Updated employee test.pratik:", empRows[0].id);
  }

  console.log("✅ TESTADMIN setup successfully completed!");
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
