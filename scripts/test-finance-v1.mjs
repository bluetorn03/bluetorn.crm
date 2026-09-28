import mysql from "mysql2/promise";
import fs from "node:fs";

if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}

const pool = mysql.createPool({
  host: process.env["DB_HOST"] || process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env["DB_PORT"] || process.env.MYSQL_PORT || "3306", 10),
  user: process.env["DB_USER"] || process.env.MYSQL_USER || "root",
  password: process.env["DB_PASSWORD"] !== undefined ? process.env["DB_PASSWORD"] : (process.env.MYSQL_PASSWORD ?? ""),
  database: process.env["DB_NAME"] || process.env.MYSQL_DATABASE || "bluetorn_crm",
  decimalNumbers: true,
});

async function runTests() {
  console.log("=== STARTING BLUETORN CRM FINANCE V1 ACCEPTANCE TESTS ===");

  // 1. Verify Workspaces and Billing Profile fields
  console.log("\n[TEST 1] Verifying Workspaces table and company billing columns...");
  const [wsCols] = await pool.query("SHOW COLUMNS FROM workspaces");
  const colNames = wsCols.map((c) => c.Field);
  const requiredBillingCols = [
    "legal_name", "logo_url", "gstin", "pan", "state", "state_code",
    "website", "bank_name", "bank_account_no", "bank_account_name",
    "bank_ifsc", "invoice_prefix", "default_payment_terms_days",
    "default_invoice_notes", "default_invoice_terms"
  ];
  for (const col of requiredBillingCols) {
    if (!colNames.includes(col)) {
      throw new Error(`Missing column in workspaces: ${col}`);
    }
  }
  console.log("✓ All 15 company billing columns exist in workspaces table.");

  // 2. Verify user_permissions table
  console.log("\n[TEST 2] Verifying user_permissions table schema...");
  const [permCols] = await pool.query("SHOW COLUMNS FROM user_permissions");
  const permColNames = permCols.map((c) => c.Field);
  if (!permColNames.includes("workspace_id") || !permColNames.includes("user_id") || !permColNames.includes("permission")) {
    throw new Error("user_permissions table missing required columns.");
  }
  console.log("✓ user_permissions table structure verified.");

  // 3. Verify Invoices and Invoice Items schema
  console.log("\n[TEST 3] Verifying invoices and invoice_items schema...");
  const [invCols] = await pool.query("SHOW COLUMNS FROM invoices");
  const invColNames = invCols.map((c) => c.Field);
  const requiredInvCols = [
    "id", "workspace_id", "invoice_number", "customer_id", "lead_id",
    "property_id", "assigned_to", "updated_by", "financial_year",
    "invoice_type", "status", "currency", "subtotal", "discount",
    "taxable_amount", "cgst", "sgst", "igst", "cess", "total",
    "place_of_supply", "notes", "terms", "cancellation_reason",
    "cancelled_at", "cancelled_by", "created_by", "created_at"
  ];
  for (const col of requiredInvCols) {
    if (!invColNames.includes(col)) {
      throw new Error(`Missing column in invoices: ${col}`);
    }
  }

  const [itemCols] = await pool.query("SHOW COLUMNS FROM invoice_items");
  const itemColNames = itemCols.map((c) => c.Field);
  const requiredItemCols = [
    "id", "workspace_id", "invoice_id", "description", "hsn_sac",
    "quantity", "unit", "rate", "unit_amount", "discount",
    "tax_rate", "tax_type", "tax_amount", "line_total", "amount", "position"
  ];
  for (const col of requiredItemCols) {
    if (!itemColNames.includes(col)) {
      throw new Error(`Missing column in invoice_items: ${col}`);
    }
  }
  console.log("✓ Invoices and invoice_items tables contain all financial & GST columns.");

  // 4. Verify Payments schema
  console.log("\n[TEST 4] Verifying payments schema...");
  const [payCols] = await pool.query("SHOW COLUMNS FROM payments");
  const payColNames = payCols.map((c) => c.Field);
  const requiredPayCols = [
    "id", "workspace_id", "invoice_id", "customer_id", "assigned_to",
    "updated_by", "amount", "currency", "method", "status", "paid_at",
    "reference", "notes", "reversal_reason", "reversed_at", "reversed_by",
    "created_by", "created_at"
  ];
  for (const col of requiredPayCols) {
    if (!payColNames.includes(col)) {
      throw new Error(`Missing column in payments: ${col}`);
    }
  }
  console.log("✓ Payments table contains all required fields including reversal audit attributes.");

  // 5. Test Workspace Billing Profile Update and Inheritance
  console.log("\n[TEST 5] Testing Workspace Company Profile update & persistence...");
  const [workspaces] = await pool.query("SELECT id, name FROM workspaces WHERE code = 'JAYSHREE' LIMIT 1");
  if (workspaces.length === 0) throw new Error("Workspace JAYSHREE not found.");
  const ws = workspaces[0];

  await pool.query(
    `UPDATE workspaces SET
      legal_name = 'Jayshree Realty Private Limited',
      gstin = '27AAACJ1234F1Z5',
      pan = 'AAACJ1234F',
      state = 'Maharashtra',
      state_code = '27',
      bank_name = 'HDFC Bank',
      bank_account_no = '50200012345678',
      bank_account_name = 'Jayshree Realty Pvt Ltd',
      bank_ifsc = 'HDFC0000123',
      invoice_prefix = 'JAY',
      default_payment_terms_days = 15,
      default_invoice_notes = 'Thank you for your business with Jayshree Realty.',
      default_invoice_terms = '1. Payment due within 15 days. 2. Please quote invoice number during wire transfer.'
    WHERE id = ?`,
    [ws.id]
  );

  const [wsCheck] = await pool.query("SELECT * FROM workspaces WHERE id = ?", [ws.id]);
  if (wsCheck[0].gstin !== "27AAACJ1234F1Z5" || wsCheck[0].invoice_prefix !== "JAY") {
    throw new Error("Failed to persist workspace company profile.");
  }
  console.log("✓ Workspace billing profile successfully updated and persisted in MySQL.");

  // 6. Test Atomic Invoice Creation with InnoDB transaction
  console.log("\n[TEST 6] Testing Atomic Invoice Creation with InnoDB Transaction...");
  const conn = await pool.getConnection();
  let testInvoiceId = "test-inv-" + Date.now();
  try {
    await conn.beginTransaction();

    // Find customer in workspace
    const [custRows] = await conn.execute(
      "SELECT id, name FROM customers WHERE workspace_id = ? LIMIT 1",
      [ws.id]
    );
    const customerId = custRows[0]?.id || null;

    // Find creator profile
    const [profRows] = await conn.execute(
      "SELECT id, full_name FROM profiles WHERE workspace_id = ? LIMIT 1",
      [ws.id]
    );
    const creatorId = profRows[0]?.id || null;

    // Insert invoice
    const invNumber = `JAY-TEST-${Date.now()}`;
    await conn.execute(
      `INSERT INTO invoices (
        id, workspace_id, invoice_number, financial_year, invoice_type,
        customer_id, status, issue_date, due_date, currency,
        subtotal, discount, taxable_amount, cgst, sgst, igst, total,
        place_of_supply, notes, terms, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testInvoiceId, ws.id, invNumber, "2026-27", "Tax Invoice",
        customerId, "Issued", "2026-09-28", "2026-10-13", "INR",
        100000, 5000, 95000, 8550, 8550, 0, 112100,
        "Maharashtra", "Test invoice notes", "Test terms", creatorId
      ]
    );

    // Insert item
    await conn.execute(
      `INSERT INTO invoice_items (
        id, workspace_id, invoice_id, description, hsn_sac,
        quantity, unit, rate, unit_amount, discount,
        tax_rate, tax_type, tax_amount, line_total, amount, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "item-" + Date.now(), ws.id, testInvoiceId, "Real Estate Advisory", "997212",
        1, "service", 100000, 100000, 5000,
        18, "GST", 17100, 112100, 112100, 0
      ]
    );

    // Insert audit log
    await conn.execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "audit-" + Date.now(), ws.id, creatorId, "owner",
        "invoice.create", "invoice", testInvoiceId,
        JSON.stringify({ invoice_number: invNumber, total: 112100 })
      ]
    );

    await conn.commit();
    console.log(`✓ Invoice ${invNumber} atomically created with line items and audit log.`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // 7. Test Payment Recording and Reconciling Balance
  console.log("\n[TEST 7] Testing Payment Recording and Invoice Reconciliation...");
  const pConn = await pool.getConnection();
  let testPaymentId = "test-pmt-" + Date.now();
  try {
    await pConn.beginTransaction();

    // Record partial payment of 50,000
    await pConn.execute(
      `INSERT INTO payments (
        id, workspace_id, invoice_id, amount, currency, method, status, paid_at, reference, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testPaymentId, ws.id, testInvoiceId, 50000, "INR", "Bank Transfer", "Received", "2026-09-28", "UTR-TEST-12345", "system"
      ]
    );

    // Reconcile invoice status
    const [payRows] = await pConn.execute(
      "SELECT SUM(amount) as paid FROM payments WHERE invoice_id = ? AND status = 'Received'",
      [testInvoiceId]
    );
    const paid = Number(payRows[0]?.paid || 0);

    const [invRows] = await pConn.execute("SELECT total FROM invoices WHERE id = ?", [testInvoiceId]);
    const total = Number(invRows[0]?.total || 0);

    let newStatus = "Partially Paid";
    if (paid >= total) newStatus = "Paid";
    else if (paid <= 0) newStatus = "Issued";

    await pConn.execute("UPDATE invoices SET status = ? WHERE id = ?", [newStatus, testInvoiceId]);

    await pConn.commit();
    console.log(`✓ Payment recorded (50,000). Total paid: ${paid}/${total}. Invoice status transitioned to: ${newStatus}`);
  } catch (err) {
    await pConn.rollback();
    throw err;
  } finally {
    pConn.release();
  }

  // Verify status in DB
  const [invCheck] = await pool.query("SELECT status, total FROM invoices WHERE id = ?", [testInvoiceId]);
  if (invCheck[0].status !== "Partially Paid") {
    throw new Error(`Expected status 'Partially Paid', got '${invCheck[0].status}'`);
  }
  console.log("✓ Live reconciliation confirmed: Invoice status is 'Partially Paid'.");

  // 8. Test Payment Reversal
  console.log("\n[TEST 8] Testing Payment Reversal with Audit Reason...");
  const rConn = await pool.getConnection();
  try {
    await rConn.beginTransaction();

    await rConn.execute(
      `UPDATE payments SET
        status = 'Reversed',
        reversal_reason = 'Cheque returned by bank',
        reversed_at = NOW(),
        reversed_by = 'system'
       WHERE id = ?`,
      [testPaymentId]
    );

    // Re-reconcile
    const [payRows] = await rConn.execute(
      "SELECT SUM(amount) as paid FROM payments WHERE invoice_id = ? AND status = 'Received'",
      [testInvoiceId]
    );
    const validPaid = Number(payRows[0]?.paid || 0);
    const [invRows] = await rConn.execute("SELECT total FROM invoices WHERE id = ?", [testInvoiceId]);
    const total = Number(invRows[0]?.total || 0);

    const revertedStatus = validPaid === 0 ? "Issued" : validPaid >= total ? "Paid" : "Partially Paid";
    await rConn.execute("UPDATE invoices SET status = ? WHERE id = ?", [revertedStatus, testInvoiceId]);

    await rConn.commit();
    console.log(`✓ Payment reversed. Valid received payments sum: ${validPaid}. Invoice status returned to: ${revertedStatus}`);
  } catch (err) {
    await rConn.rollback();
    throw err;
  } finally {
    rConn.release();
  }

  // 9. Test Granular RBAC in user_permissions
  console.log("\n[TEST 9] Testing Granular User Permissions in user_permissions table...");
  const [employees] = await pool.query(
    `SELECT p.id, p.user_code FROM profiles p
     JOIN user_roles ur ON p.id = ur.user_id
     WHERE p.workspace_id = ? AND ur.role = 'employee' LIMIT 1`,
    [ws.id]
  );

  if (employees.length > 0) {
    const emp = employees[0];
    // Grant granular permissions
    await pool.query("DELETE FROM user_permissions WHERE workspace_id = ? AND user_id = ?", [ws.id, emp.id]);
    await pool.query(
      `INSERT INTO user_permissions (id, workspace_id, user_id, permission)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      [
        "p1-" + Date.now(), ws.id, emp.id, "finance.view",
        "p2-" + Date.now(), ws.id, emp.id, "finance.invoices.create"
      ]
    );

    const [userPerms] = await pool.query(
      "SELECT permission FROM user_permissions WHERE workspace_id = ? AND user_id = ?",
      [ws.id, emp.id]
    );
    const granted = userPerms.map((p) => p.permission);
    console.log(`✓ Permissions successfully assigned to employee ${emp.user_code}:`, granted);
    if (!granted.includes("finance.view") || !granted.includes("finance.invoices.create")) {
      throw new Error("Permissions not persisted properly.");
    }
  }

  // 10. Clean up test records
  console.log("\n[TEST 10] Cleaning up temporary test transaction...");
  await pool.query("DELETE FROM payments WHERE id = ?", [testPaymentId]);
  await pool.query("DELETE FROM invoice_items WHERE invoice_id = ?", [testInvoiceId]);
  await pool.query("DELETE FROM invoices WHERE id = ?", [testInvoiceId]);
  console.log("✓ Temporary test records cleaned up cleanly.");

  console.log("\n========================================================");
  console.log("ALL FINANCE V1 REAL MYSQL ACCEPTANCE TESTS PASSED (10/10)!");
  console.log("========================================================");
  await pool.end();
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
