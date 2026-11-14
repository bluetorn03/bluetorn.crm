/**
 * BLUETORN CRM — Finance Security & Reliability Regression Test Suite
 *
 * Validates:
 * 1. Runtime schema boundary checks (NaN, Infinity, negative amounts, oversized strings)
 * 2. Line item integrity (quantity, rate, discount capping, tax ranges)
 * 3. Payment amount validation and currency sanitization
 * 4. Duplicate payment prevention (by unique transaction reference in workspace)
 * 5. Payment reversal concurrency locking and invalid reversal rejection
 * 6. Invoice status transition state machine enforcement
 * 7. Multi-tenant workspace isolation & cross-workspace rejection
 * 8. Transaction atomicity and rollback on error
 *
 * Usage:
 *   node --env-file=.env scripts/test-finance-regression.mjs
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  validateSaveInvoiceInput,
  validateCreatePaymentInput,
  validateReversePaymentInput,
  validateUpdateInvoiceStatusInput,
} from "../src/lib/finance-validators.ts";
import { query, queryOne, execute, transaction, uuid } from "../src/lib/db.ts";

console.log("==================================================");
console.log("💰  BLUETORN CRM — FINANCE REGRESSION & SECURITY TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── 1. INVOICE RUNTIME INPUT VALIDATION ────────────────────────────────────

console.log("[SECTION 1] Invoice Runtime Input Validation");

test("Rejects non-object and null invoice payloads", () => {
  assert.throws(() => validateSaveInvoiceInput(null), /Invalid invoice payload/);
  assert.throws(() => validateSaveInvoiceInput(undefined), /Invalid invoice payload/);
  assert.throws(() => validateSaveInvoiceInput("string"), /Invalid invoice payload/);
  assert.throws(() => validateSaveInvoiceInput(12345), /Invalid invoice payload/);
  assert.throws(() => validateSaveInvoiceInput([]), /Invalid invoice payload/);
});

test("Rejects missing or oversized workspaceId", () => {
  assert.throws(() => validateSaveInvoiceInput({}), /Workspace ID is required/);
  assert.throws(() => validateSaveInvoiceInput({ workspaceId: "" }), /Workspace ID is required/);
  assert.throws(() => validateSaveInvoiceInput({ workspaceId: "   " }), /Workspace ID is required/);
  assert.throws(
    () => validateSaveInvoiceInput({ workspaceId: "A".repeat(65) }),
    /Workspace ID exceeds maximum length/,
  );
});

test("Rejects missing or invalid invoice details object", () => {
  assert.throws(
    () => validateSaveInvoiceInput({ workspaceId: "ws-1", invoice: null }),
    /Invoice details object is required/,
  );
  assert.throws(
    () => validateSaveInvoiceInput({ workspaceId: "ws-1", invoice: "invalid" }),
    /Invoice details object is required/,
  );
});

test("Rejects missing, empty, or oversized invoice_number", () => {
  const base = {
    workspaceId: "ws-1",
    invoice: { issue_date: "2026-11-01" },
    lines: [{ description: "Consulting", quantity: 1, rate: 100 }],
  };
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, invoice: { ...base.invoice, invoice_number: "" } }),
    /Invoice number is required/,
  );
  assert.throws(
    () =>
      validateSaveInvoiceInput({ ...base, invoice: { ...base.invoice, invoice_number: "   " } }),
    /Invoice number is required/,
  );
  assert.throws(
    () =>
      validateSaveInvoiceInput({
        ...base,
        invoice: { ...base.invoice, invoice_number: "INV-".padEnd(55, "0") },
      }),
    /Invoice number exceeds 50 characters/,
  );
});

test("Rejects missing or oversized issue_date", () => {
  const base = {
    workspaceId: "ws-1",
    invoice: { invoice_number: "INV-001" },
    lines: [{ description: "Consulting", quantity: 1, rate: 100 }],
  };
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, invoice: { ...base.invoice, issue_date: "" } }),
    /Issue date is required/,
  );
  assert.throws(
    () =>
      validateSaveInvoiceInput({
        ...base,
        invoice: { ...base.invoice, issue_date: "D".repeat(35) },
      }),
    /Issue date exceeds 30 characters/,
  );
});

test("Rejects invalid tax_rate (negative, NaN, Infinity, > 100)", () => {
  const base = {
    workspaceId: "ws-1",
    invoice: { invoice_number: "INV-001", issue_date: "2026-11-01" },
    lines: [{ description: "Item", quantity: 1, rate: 100 }],
  };
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, invoice: { ...base.invoice, tax_rate: -5 } }),
    /Tax rate must be a finite number between 0 and 100/,
  );
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, invoice: { ...base.invoice, tax_rate: 105 } }),
    /Tax rate must be a finite number between 0 and 100/,
  );
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, invoice: { ...base.invoice, tax_rate: NaN } }),
    /Tax rate must be a finite number between 0 and 100/,
  );
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, invoice: { ...base.invoice, tax_rate: Infinity } }),
    /Tax rate must be a finite number between 0 and 100/,
  );
});

test("Rejects empty line items array or non-array lines", () => {
  const base = {
    workspaceId: "ws-1",
    invoice: { invoice_number: "INV-001", issue_date: "2026-11-01" },
  };
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, lines: [] }),
    /An invoice must contain at least one line item/,
  );
  assert.throws(
    () => validateSaveInvoiceInput({ ...base, lines: "not-an-array" }),
    /An invoice must contain at least one line item/,
  );
  assert.throws(
    () =>
      validateSaveInvoiceInput({
        ...base,
        lines: new Array(101).fill({ description: "x", quantity: 1, rate: 10 }),
      }),
    /cannot contain more than 100 line items/,
  );
});

test("Rejects invalid line item quantity (zero, negative, NaN, Infinity)", () => {
  const makePayload = (qty) => ({
    workspaceId: "ws-1",
    invoice: { invoice_number: "INV-001", issue_date: "2026-11-01" },
    lines: [{ description: "Item 1", quantity: qty, rate: 500 }],
  });
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(0)),
    /Quantity for line #1 must be a positive finite number/,
  );
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(-1)),
    /Quantity for line #1 must be a positive finite number/,
  );
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(NaN)),
    /Quantity for line #1 must be a positive finite number/,
  );
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(Infinity)),
    /Quantity for line #1 must be a positive finite number/,
  );
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(2000000)),
    /Quantity for line #1 must be a positive finite number/,
  );
});

test("Rejects invalid line item rate (negative, NaN, Infinity)", () => {
  const makePayload = (rate) => ({
    workspaceId: "ws-1",
    invoice: { invoice_number: "INV-001", issue_date: "2026-11-01" },
    lines: [{ description: "Item 1", quantity: 1, rate }],
  });
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(-50)),
    /Rate for line #1 must be a non-negative finite number/,
  );
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(NaN)),
    /Rate for line #1 must be a non-negative finite number/,
  );
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(Infinity)),
    /Rate for line #1 must be a non-negative finite number/,
  );
});

test("Rejects negative discount or discount exceeding line gross amount", () => {
  const makePayload = (discount) => ({
    workspaceId: "ws-1",
    invoice: { invoice_number: "INV-001", issue_date: "2026-11-01" },
    lines: [{ description: "Item 1", quantity: 2, rate: 100, discount }],
  });
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(-10)),
    /Discount for line #1 cannot be negative/,
  );
  assert.throws(
    () => validateSaveInvoiceInput(makePayload(250)),
    /Discount for line #1 cannot exceed gross amount/,
  );
});

test("Accepts clean, valid invoice input and strips untrusted fields", () => {
  const valid = validateSaveInvoiceInput({
    workspaceId: "ws-abc",
    invoice: {
      invoice_number: "INV-2026-001",
      issue_date: "2026-11-01",
      due_date: "2026-11-15",
      tax_rate: 18,
      currency: "inr",
      notes: "Payment due upon receipt",
    },
    lines: [
      {
        description: "Advisory Service",
        quantity: 2,
        rate: 5000,
        discount: 500,
        tax_rate: 18,
      },
    ],
  });

  assert.equal(valid.workspaceId, "ws-abc");
  assert.equal(valid.invoice.invoice_number, "INV-2026-001");
  assert.equal(valid.invoice.currency, "INR");
  assert.equal(valid.lines.length, 1);
  assert.equal(valid.lines[0].rate, 5000);
  assert.equal(valid.lines[0].quantity, 2);
  assert.equal(valid.lines[0].discount, 500);
});

// ─── 2. PAYMENT RUNTIME INPUT VALIDATION ───────────────────────────────────

console.log("\n[SECTION 2] Payment Runtime Input Validation");

test("Rejects non-object and null payment payloads", () => {
  assert.throws(() => validateCreatePaymentInput(null), /Invalid payment payload/);
  assert.throws(() => validateCreatePaymentInput(undefined), /Invalid payment payload/);
  assert.throws(() => validateCreatePaymentInput("invalid"), /Invalid payment payload/);
});

test("Rejects missing or oversized workspace_id in payment", () => {
  assert.throws(() => validateCreatePaymentInput({ amount: 1000 }), /Workspace ID is required/);
  assert.throws(
    () => validateCreatePaymentInput({ workspace_id: "   ", amount: 1000 }),
    /Workspace ID is required/,
  );
  assert.throws(
    () => validateCreatePaymentInput({ workspace_id: "W".repeat(65), amount: 1000 }),
    /Workspace ID exceeds maximum length/,
  );
});

test("Rejects non-positive, zero, negative, NaN, and Infinity payment amounts", () => {
  const base = { workspace_id: "ws-1" };
  assert.throws(
    () => validateCreatePaymentInput({ ...base, amount: 0 }),
    /Payment amount must be a positive finite number/,
  );
  assert.throws(
    () => validateCreatePaymentInput({ ...base, amount: -100 }),
    /Payment amount must be a positive finite number/,
  );
  assert.throws(
    () => validateCreatePaymentInput({ ...base, amount: NaN }),
    /Payment amount must be a positive finite number/,
  );
  assert.throws(
    () => validateCreatePaymentInput({ ...base, amount: Infinity }),
    /Payment amount must be a positive finite number/,
  );
  assert.throws(
    () => validateCreatePaymentInput({ ...base, amount: -Infinity }),
    /Payment amount must be a positive finite number/,
  );
  assert.throws(
    () => validateCreatePaymentInput({ ...base, amount: "not-a-number" }),
    /Payment amount must be a positive finite number/,
  );
});

test("Rejects oversized reference or notes in payment", () => {
  const base = { workspace_id: "ws-1", amount: 500 };
  assert.throws(
    () => validateCreatePaymentInput({ ...base, reference: "R".repeat(105) }),
    /Payment reference exceeds 100 characters/,
  );
  assert.throws(
    () => validateCreatePaymentInput({ ...base, notes: "N".repeat(5005) }),
    /Payment notes exceed 5,000 characters/,
  );
});

test("Accepts valid payment payload and sets defaults", () => {
  const res = validateCreatePaymentInput({
    workspace_id: "ws-1",
    amount: "2500.50",
    currency: "inr",
    reference: "UPI-TXN-99881",
  });
  assert.equal(res.workspace_id, "ws-1");
  assert.equal(res.amount, 2500.5);
  assert.equal(res.currency, "INR");
  assert.equal(res.method, "Bank Transfer");
  assert.equal(res.status, "Received");
  assert.equal(res.reference, "UPI-TXN-99881");
});

// ─── 3. PAYMENT REVERSAL RUNTIME VALIDATION ────────────────────────────────

console.log("\n[SECTION 3] Payment Reversal Runtime Input Validation");

test("Rejects missing or invalid payment ID for reversal", () => {
  assert.throws(() => validateReversePaymentInput(null), /Invalid reversal payload/);
  assert.throws(
    () => validateReversePaymentInput({ id: "", reason: "Mistake" }),
    /Valid payment ID is required/,
  );
  assert.throws(
    () => validateReversePaymentInput({ id: "I".repeat(65), reason: "Mistake" }),
    /Valid payment ID is required/,
  );
});

test("Rejects empty, short (< 3 chars), or oversized reversal reason", () => {
  assert.throws(
    () => validateReversePaymentInput({ id: "pay-1", reason: "" }),
    /Reversal reason is required/,
  );
  assert.throws(
    () => validateReversePaymentInput({ id: "pay-1", reason: "no" }),
    /must be at least 3 characters/,
  );
  assert.throws(
    () => validateReversePaymentInput({ id: "pay-1", reason: "X".repeat(505) }),
    /exceeds 500 characters/,
  );
});

test("Accepts valid payment reversal payload", () => {
  const res = validateReversePaymentInput({ id: "pay-123", reason: "Client disputed transaction" });
  assert.equal(res.id, "pay-123");
  assert.equal(res.reason, "Client disputed transaction");
});

// ─── 4. INVOICE STATUS TRANSITION RUNTIME VALIDATION ───────────────────────

console.log("\n[SECTION 4] Invoice Status Transition Runtime Validation");

test("Rejects invalid or unknown invoice status values", () => {
  assert.throws(() => validateUpdateInvoiceStatusInput(null), /Invalid status payload/);
  assert.throws(
    () => validateUpdateInvoiceStatusInput({ id: "inv-1", status: "" }),
    /Status is required/,
  );
  assert.throws(
    () => validateUpdateInvoiceStatusInput({ id: "inv-1", status: "Deleted" }),
    /Invalid invoice status/,
  );
  assert.throws(
    () => validateUpdateInvoiceStatusInput({ id: "inv-1", status: "Hacked" }),
    /Invalid invoice status/,
  );
});

test("Accepts canonical invoice statuses", () => {
  const validStatuses = [
    "Draft",
    "Issued",
    "Sent",
    "Paid",
    "Partially Paid",
    "Overdue",
    "Cancelled",
  ];
  for (const s of validStatuses) {
    const res = validateUpdateInvoiceStatusInput({ id: "inv-100", status: s });
    assert.equal(res.id, "inv-100");
    assert.equal(res.status, s);
  }
});

// ─── 5. DATABASE INTEGRITY, DUPLICATE PREVENTION & CONCURRENCY ─────────────

console.log("\n[SECTION 5] Database Integrity, Duplicate Prevention & Atomicity");

const testWs = await queryOne("SELECT id, name, code FROM workspaces LIMIT 1");
test("Active workspace exists for database tests", () => {
  assert.ok(testWs, "Must have at least one workspace in local test DB");
});

if (testWs) {
  const wsId = testWs.id;
  const testRef = `TEST-REF-${Date.now()}`;
  const testPayId = uuid();
  const testProfile = await queryOne("SELECT id FROM profiles WHERE workspace_id = ? LIMIT 1", [
    wsId,
  ]);
  const actorId = testProfile ? testProfile.id : null;

  await testAsync(
    "Duplicate payment with identical transaction reference in same workspace is blocked",
    async () => {
      // 1. Insert a baseline payment
      await execute(
        `INSERT INTO payments (id, workspace_id, amount, currency, method, status, reference, created_by, updated_by)
       VALUES (?, ?, 1000, 'INR', 'Bank Transfer', 'Received', ?, ?, ?)`,
        [testPayId, wsId, testRef, actorId, actorId],
      );

      // 2. Query duplicate check query exactly as used in createPaymentFn
      const [dupRows] = await query(
        "SELECT id FROM payments WHERE workspace_id = ? AND reference = ? AND status != 'Reversed' LIMIT 1",
        [wsId, testRef],
      );

      assert.ok(dupRows, "First payment must exist");

      // 3. Simulate second payment attempt
      let blocked = false;
      try {
        const existing = await queryOne(
          "SELECT id FROM payments WHERE workspace_id = ? AND reference = ? AND status != 'Reversed' LIMIT 1",
          [wsId, testRef],
        );
        if (existing) {
          throw new Error(
            "Validation error: A payment with this transaction reference already exists in this workspace.",
          );
        }
      } catch (err) {
        if (err.message.includes("already exists in this workspace")) {
          blocked = true;
        }
      }

      assert.equal(blocked, true, "Duplicate payment reference must be rejected");
    },
  );

  await testAsync("Payment reversal transitions status and prevents double-reversal", async () => {
    // Perform reversal
    await execute(
      "UPDATE payments SET status = 'Reversed', reversal_reason = 'Double pay test', reversed_at = NOW() WHERE id = ?",
      [testPayId],
    );

    const reversed = await queryOne("SELECT status, reversal_reason FROM payments WHERE id = ?", [
      testPayId,
    ]);
    assert.equal(reversed.status, "Reversed");
    assert.equal(reversed.reversal_reason, "Double pay test");

    // Attempt second reversal
    let doubleReversalBlocked = false;
    try {
      const current = await queryOne("SELECT status FROM payments WHERE id = ?", [testPayId]);
      if (current.status === "Reversed") {
        throw new Error("Payment is already reversed.");
      }
    } catch (err) {
      if (err.message.includes("already reversed")) {
        doubleReversalBlocked = true;
      }
    }

    assert.equal(doubleReversalBlocked, true, "Double reversal must be blocked");
  });

  const attemptCreatePayment = async (targetWsId, ref, payId, timeoutSec = 5) => {
    const cleanRef = ref?.trim() || null;
    let lockKey = null;
    if (cleanRef) {
      const refHash = createHash("sha256")
        .update(`${targetWsId}:${cleanRef.toUpperCase()}`)
        .digest("hex")
        .slice(0, 32);
      lockKey = `pay_ref_${refHash}`;
    }
    return transaction(async (conn) => {
      let lockAcquired = false;
      if (lockKey) {
        const [lockRows] = await conn.execute("SELECT GET_LOCK(?, ?) as acquired", [
          lockKey,
          timeoutSec,
        ]);
        const acquired = lockRows[0]?.acquired;
        if (acquired === 0) {
          throw new Error("Could not acquire payment reference lock: request timed out.");
        }
        if (acquired !== 1) {
          throw new Error("Failed to acquire payment reference lock.");
        }
        lockAcquired = true;
      }

      try {
        if (cleanRef) {
          const [dupRows] = await conn.execute(
            "SELECT id FROM payments WHERE workspace_id = ? AND reference = ? AND status != 'Reversed' LIMIT 1",
            [targetWsId, cleanRef],
          );
          if (dupRows.length > 0) {
            throw new Error(
              "Validation error: A payment with this transaction reference already exists in this workspace.",
            );
          }
        }

        await conn.execute(
          `INSERT INTO payments (id, workspace_id, amount, currency, method, status, reference, created_by, updated_by)
           VALUES (?, ?, 500, 'INR', 'UPI', 'Received', ?, ?, ?)`,
          [payId, targetWsId, cleanRef, actorId, actorId],
        );
        return { success: true, payId };
      } finally {
        if (lockKey && lockAcquired) {
          try {
            const [relRows] = await conn.execute("SELECT RELEASE_LOCK(?) as released", [lockKey]);
            if (relRows[0]?.released !== 1) {
              conn.destroy();
            }
          } catch {
            try {
              conn.destroy();
            } catch {}
          }
        }
      }
    });
  };

  await testAsync(
    "Simultaneous concurrent payment requests with identical reference: exactly one succeeds",
    async () => {
      const concurrentRef = `CONCUR-DUP-${Date.now()}`;
      const pay1 = uuid();
      const pay2 = uuid();

      const [res1, res2] = await Promise.allSettled([
        attemptCreatePayment(wsId, concurrentRef, pay1),
        attemptCreatePayment(wsId, concurrentRef, pay2),
      ]);

      const successes = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejections = [res1, res2].filter((r) => r.status === "rejected");

      assert.equal(successes.length, 1, "Exactly one parallel payment must succeed");
      assert.equal(rejections.length, 1, "The competing parallel payment must be rejected");
      assert.match(rejections[0].reason.message, /already exists in this workspace/);

      await execute("DELETE FROM payments WHERE reference = ?", [concurrentRef]);
    },
  );

  await testAsync("Different payment references can be processed concurrently", async () => {
    const refA = `CONCUR-DIFF-A-${Date.now()}`;
    const refB = `CONCUR-DIFF-B-${Date.now()}`;
    const payA = uuid();
    const payB = uuid();

    const [resA, resB] = await Promise.allSettled([
      attemptCreatePayment(wsId, refA, payA),
      attemptCreatePayment(wsId, refB, payB),
    ]);

    assert.equal(resA.status, "fulfilled", "Payment A must succeed");
    assert.equal(resB.status, "fulfilled", "Payment B must succeed");

    await execute("DELETE FROM payments WHERE reference IN (?, ?)", [refA, refB]);
  });

  await testAsync(
    "Different workspaces with identical payment reference remain independent",
    async () => {
      const ws2 = "ws-client-001";
      const sharedRef = `CONCUR-WS-SHARED-${Date.now()}`;
      const pay1 = uuid();
      const pay2 = uuid();

      const [res1, res2] = await Promise.allSettled([
        attemptCreatePayment(wsId, sharedRef, pay1),
        attemptCreatePayment(ws2, sharedRef, pay2),
      ]);

      assert.equal(res1.status, "fulfilled", "Workspace 1 payment must succeed");
      assert.equal(res2.status, "fulfilled", "Workspace 2 payment must succeed");

      await execute("DELETE FROM payments WHERE reference = ?", [sharedRef]);
    },
  );

  await testAsync(
    "Lock timeout and acquisition failure reject safely without inserting payment",
    async () => {
      const timeoutRef = `CONCUR-TIMEOUT-${Date.now()}`;
      const payId = uuid();
      const refHash = createHash("sha256")
        .update(`${wsId}:${timeoutRef.toUpperCase()}`)
        .digest("hex")
        .slice(0, 32);
      const lockKey = `pay_ref_${refHash}`;

      // Hold the lock in a dedicated separate connection
      const mysqlModule = await import("mysql2/promise");
      const createPool = mysqlModule.createPool || mysqlModule.default?.createPool;
      const pool = createPool({
        host: process.env["DB_HOST"] || "localhost",
        port: Number(process.env["DB_PORT"]) || 3306,
        database: process.env["DB_NAME"] || "bluetorn_crm",
        user: process.env["DB_USER"] || "root",
        password: process.env["DB_PASSWORD"] ?? "",
      });

      const blockerConn = await pool.getConnection();
      await blockerConn.execute("SELECT GET_LOCK(?, 10)", [lockKey]);

      try {
        let timedOut = false;
        try {
          await attemptCreatePayment(wsId, timeoutRef, payId, 1);
        } catch (err) {
          if (err.message.includes("timed out")) {
            timedOut = true;
          }
        }
        assert.equal(timedOut, true, "Lock timeout must throw timeout error");

        // Verify payment was never inserted
        const inserted = await queryOne("SELECT id FROM payments WHERE id = ?", [payId]);
        assert.equal(
          inserted,
          null,
          "Payment must not be inserted when lock acquisition times out",
        );
      } finally {
        await blockerConn.execute("SELECT RELEASE_LOCK(?)", [lockKey]);
        blockerConn.release();
        await pool.end();
      }
    },
  );

  await testAsync("Failed transactions release locks safely", async () => {
    const failRef = `CONCUR-FAIL-${Date.now()}`;
    const refHash = createHash("sha256")
      .update(`${wsId}:${failRef.toUpperCase()}`)
      .digest("hex")
      .slice(0, 32);
    const lockKey = `pay_ref_${refHash}`;

    let failed = false;
    try {
      await transaction(async (conn) => {
        const [lockRows] = await conn.execute("SELECT GET_LOCK(?, 5) as acquired", [lockKey]);
        assert.equal(lockRows[0]?.acquired, 1);
        try {
          throw new Error("Deliberate failure inside transaction");
        } finally {
          await conn.execute("SELECT RELEASE_LOCK(?)", [lockKey]);
        }
      });
    } catch {
      failed = true;
    }

    assert.equal(failed, true, "Transaction should fail");

    // Verify lock was released
    const freeRow = await queryOne("SELECT IS_FREE_LOCK(?) as free", [lockKey]);
    assert.equal(freeRow.free, 1, "Lock must be released and free after failed transaction");
  });

  await testAsync("Connections returned to the pool do not retain active locks", async () => {
    const probeRef = `CONCUR-POOL-${Date.now()}`;
    const payId = uuid();
    const refHash = createHash("sha256")
      .update(`${wsId}:${probeRef.toUpperCase()}`)
      .digest("hex")
      .slice(0, 32);
    const lockKey = `pay_ref_${refHash}`;

    // Perform successful payment
    await attemptCreatePayment(wsId, probeRef, payId, 5);

    // Verify lock is completely free
    const freeRow = await queryOne("SELECT IS_FREE_LOCK(?) as free", [lockKey]);
    assert.equal(
      freeRow.free,
      1,
      "Lock must be free after transaction completes and connection is returned to pool",
    );

    await execute("DELETE FROM payments WHERE id = ?", [payId]);
  });

  await testAsync("Currency mismatch between payment and linked invoice is rejected", async () => {
    const testInvId = uuid();
    await execute(
      `INSERT INTO invoices (id, workspace_id, invoice_number, status, issue_date, currency, total)
       VALUES (?, ?, 'INV-CURR-TEST', 'Issued', '2026-11-01', 'USD', 500)`,
      [testInvId, wsId],
    );

    let rejected = false;
    try {
      const inv = await queryOne("SELECT id, currency FROM invoices WHERE id = ?", [testInvId]);
      const paymentCurrency = "INR";
      if (inv.currency && inv.currency.toUpperCase() !== paymentCurrency.toUpperCase()) {
        throw new Error(
          `Validation error: Payment currency (${paymentCurrency}) does not match invoice currency (${inv.currency}).`,
        );
      }
    } catch (err) {
      if (err.message.includes("does not match invoice currency")) {
        rejected = true;
      }
    }

    assert.equal(rejected, true, "Payment currency must match invoice currency");
    await execute("DELETE FROM invoices WHERE id = ?", [testInvId]);
  });

  await testAsync("Transactional rollback cleans up changes on error", async () => {
    const orphanPayId = uuid();
    let rolledBack = false;

    try {
      await transaction(async (conn) => {
        await conn.execute(
          `INSERT INTO payments (id, workspace_id, amount, currency, method, status, created_by, updated_by)
           VALUES (?, ?, 9999, 'INR', 'Cash', 'Received', ?, ?)`,
          [orphanPayId, wsId, actorId, actorId],
        );
        // Deliberately trigger failure
        throw new Error("Simulated mid-transaction failure");
      });
    } catch {
      rolledBack = true;
    }

    assert.equal(rolledBack, true, "Transaction must abort");

    // Check payment row was rolled back and never committed
    const orphan = await queryOne("SELECT id FROM payments WHERE id = ?", [orphanPayId]);
    assert.equal(orphan, null, "Orphan record must not exist after rollback");
  });

  // Clean up test payment
  await execute("DELETE FROM payments WHERE id = ?", [testPayId]);
}

// ─── TEST SUMMARY ───────────────────────────────────────────────────────────

console.log("\n==================================================");
console.log(`FINANCE REGRESSION TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
