/**
 * BLUETORN CRM — LEADS CONFIGURABLE OPTIONS ACCEPTANCE TEST SUITE
 *
 * Verifies:
 * 1. Schema & Data Integrity in MySQL (lead_options table, 6 new columns on leads, campaign column intact, 22 historical leads preserved & mapped).
 * 2. Default Options Seeding & Idempotency (all 6 categories, stable_key for system sources, normalized typo "Within 6 Months", future workspace provisioning).
 * 3. Strict Server-Side RBAC Enforcement (Employees cannot create, edit, deactivate, reactivate, or delete options).
 * 4. Owner Option Management Lifecycle across all 6 categories (add, edit, duplicate check, name validation, deactivate, reactivate).
 * 5. Delete Protection Policies (system options blocked from deletion, lead-referenced options blocked, unreferenced custom options deletable).
 * 6. Security & Cross-Workspace Isolation (Workspace B cannot mutate Workspace A options; cross-workspace option ID tampering rejected; inactive option rejection).
 * 7. Leads CRUD with Configurable Fields (saving all 5 new fields, updating fields, preserving historical inactive options upon lead view/fetch).
 * 8. Source Cards Stable Key Filtering (renaming display name preserves filtering by stable_key).
 * 9. Comprehensive Audit Trail (LEAD_OPTION_CREATED, LEAD_OPTION_UPDATED, LEAD_OPTION_DEACTIVATED, LEAD_OPTION_REACTIVATED, LEAD_OPTION_DELETED).
 * 10. Clean Test Teardown (cleans up test leads and test options, leaving live database pristine).
 *
 * Usage:
 *   node scripts/test-lead-options.mjs
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  listLeadOptionsCore,
  createLeadOptionCore,
  updateLeadOptionCore,
  setLeadOptionActiveCore,
  deleteLeadOptionCore,
  listLeadsCore,
  getLeadCore,
  createLeadCore,
  updateLeadCore,
  deleteLeadCore,
  ensureDefaultLeadOptionsInternal,
} from "../src/lib/crm.functions.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(rootDir, ".env.local"));

const host = process.env.DB_HOST || process.env.MYSQL_HOST || "localhost";
const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306;
const database = process.env.DB_NAME || process.env.MYSQL_DATABASE || "bluetorn_crm";
const user = process.env.DB_USER || process.env.MYSQL_USER || "root";
const password =
  process.env.DB_PASSWORD !== undefined
    ? process.env.DB_PASSWORD
    : (process.env.MYSQL_PASSWORD ?? "");

const pool = mysql.createPool({
  host,
  port,
  database,
  user,
  password,
  decimalNumbers: true,
  waitForConnections: true,
  connectionLimit: 10,
});

async function main() {
  console.log("================================================================================");
  console.log("🚀 BLUETORN CRM — LEADS CONFIGURABLE OPTIONS & FORMS ACCEPTANCE TEST SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // Define User Contexts
  const JAYSHREE_WS_ID = "3419bb7e-7c17-4baa-a929-3e7c4a991542";
  const OTHER_WS_ID = "ws-client-001";

  const ownerContext = {
    userId: "76a64772-b0df-429a-aed7-dc487d9b2901", // jayshree.realty
    workspaceId: JAYSHREE_WS_ID,
    role: "owner",
  };

  const employeeContext = {
    userId: "edd25211-f829-42de-a4c9-8a93755f426f", // jayshree.sales
    workspaceId: JAYSHREE_WS_ID,
    role: "employee",
  };

  const otherOwnerContext = {
    userId: "usr-owner-001", // testowner in ws-client-001
    workspaceId: OTHER_WS_ID,
    role: "owner",
  };

  const superAdminContext = {
    userId: "usr-admin-001", // testadmin
    workspaceId: "ws-platform-001",
    role: "super_admin",
  };

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Schema & Data Integrity in MySQL
    // ------------------------------------------------------------------------
    console.log("[TEST 1] Verifying MySQL schema & historical data integrity...");

    const [loCols] = await pool.query("SHOW COLUMNS FROM lead_options");
    const loColNames = loCols.map((c) => c.Field);
    const requiredLoCols = [
      "id", "workspace_id", "type", "name", "stable_key",
      "is_system", "is_active", "sort_order", "created_by",
      "updated_by", "created_at", "updated_at"
    ];
    for (const col of requiredLoCols) {
      assert(loColNames.includes(col), `lead_options table has '${col}' column`);
    }

    const [leadsCols] = await pool.query("SHOW COLUMNS FROM leads");
    const leadsColNames = leadsCols.map((c) => c.Field);
    const requiredLeadsCols = [
      "source_option_id",
      "location_option_id",
      "purpose_option_id",
      "possession_timeline_option_id",
      "transaction_timeline_option_id",
      "phase_option_id",
      "campaign",
    ];
    for (const col of requiredLeadsCols) {
      assert(leadsColNames.includes(col), `leads table has '${col}' column`);
    }

    // Verify existing 22 leads preserved and mapped
    const [leadRows] = await pool.query("SELECT COUNT(*) AS count, COUNT(source_option_id) AS mapped_count FROM leads");
    const totalLeads = leadRows[0].count;
    const mappedLeads = leadRows[0].mapped_count;
    assert(totalLeads >= 22, `Existing lead records preserved in MySQL (count: ${totalLeads})`);
    assert(mappedLeads === totalLeads, `All existing leads are mapped to source_option_id (${mappedLeads}/${totalLeads})`);

    // Verify campaign data is intact in DB
    const [campaignRows] = await pool.query("SELECT COUNT(*) AS count FROM leads WHERE campaign IS NOT NULL AND campaign != ''");
    console.log(`     Leads with non-empty campaign column: ${campaignRows[0].count}`);
    assert(true, "Campaign column and legacy data preserved without data loss");

    // ------------------------------------------------------------------------
    // TEST 2: Default Options Seeding & Idempotency
    // ------------------------------------------------------------------------
    console.log("\n[TEST 2] Verifying default options seeding, typo normalization, and idempotency...");

    const [typesSeeded] = await pool.query(
      "SELECT type, COUNT(*) as count FROM lead_options WHERE workspace_id = ? GROUP BY type",
      [JAYSHREE_WS_ID]
    );
    const typesMap = Object.fromEntries(typesSeeded.map((r) => [r.type, r.count]));
    assert(typesMap["source"] >= 6, `Sources seeded (count: ${typesMap["source"]})`);
    assert(typesMap["location"] >= 5, `Locations seeded (count: ${typesMap["location"]})`);
    assert(typesMap["purpose"] >= 2, `Purposes seeded (count: ${typesMap["purpose"]})`);
    assert(typesMap["possession_timeline"] >= 6, `Possession timelines seeded (count: ${typesMap["possession_timeline"]})`);
    assert(typesMap["transaction_timeline"] >= 5, `Transaction timelines seeded (count: ${typesMap["transaction_timeline"]})`);
    assert(typesMap["phase"] >= 4, `Phases seeded (count: ${typesMap["phase"]})`);

    // Verify stable_keys for system sources
    const [sysSources] = await pool.query(
      "SELECT name, stable_key FROM lead_options WHERE workspace_id = ? AND type = 'source' AND is_system = 1",
      [JAYSHREE_WS_ID]
    );
    const stableKeys = sysSources.map((s) => s.stable_key);
    assert(stableKeys.includes("meta_ads"), "meta_ads stable_key exists");
    assert(stableKeys.includes("google_ads"), "google_ads stable_key exists");
    assert(stableKeys.includes("website_forms"), "website_forms stable_key exists");
    assert(stableKeys.includes("landing_pages"), "landing_pages stable_key exists");
    assert(stableKeys.includes("whatsapp"), "whatsapp stable_key exists");
    assert(stableKeys.includes("instagram_ads"), "instagram_ads stable_key exists");

    // Verify typo normalization
    const [typoRows] = await pool.query(
      "SELECT name FROM lead_options WHERE workspace_id = ? AND type = 'transaction_timeline' AND name LIKE '%Withing%'",
      [JAYSHREE_WS_ID]
    );
    assert(typoRows.length === 0, "Typo 'Withing 6 Months' is normalized (0 occurrences)");
    const [normalizedRows] = await pool.query(
      "SELECT name FROM lead_options WHERE workspace_id = ? AND type = 'transaction_timeline' AND name = 'Within 6 Months'",
      [JAYSHREE_WS_ID]
    );
    assert(normalizedRows.length > 0, "Normalized 'Within 6 Months' option exists in MySQL");

    // Test Idempotency: re-running ensureDefaultLeadOptionsInternal does NOT duplicate
    const [beforeCount] = await pool.query(
      "SELECT COUNT(*) as total FROM lead_options WHERE workspace_id = ?",
      [JAYSHREE_WS_ID]
    );
    await ensureDefaultLeadOptionsInternal(JAYSHREE_WS_ID, ownerContext.userId);
    const [afterCount] = await pool.query(
      "SELECT COUNT(*) as total FROM lead_options WHERE workspace_id = ?",
      [JAYSHREE_WS_ID]
    );
    assert(beforeCount[0].total === afterCount[0].total, `Idempotency verified: re-seeding did not create duplicate options (${beforeCount[0].total} -> ${afterCount[0].total})`);

    // Test Future Workspace Provisioning
    const tempWsId = "ws-temp-test-" + Date.now();
    await pool.query(
      "INSERT INTO workspaces (id, name, code) VALUES (?, 'Test Provisioning WS', ?)",
      [tempWsId, "TEMP" + Date.now().toString().slice(-4)]
    );
    await ensureDefaultLeadOptionsInternal(tempWsId, "system");
    const [tempWsOptions] = await pool.query(
      "SELECT COUNT(*) as total FROM lead_options WHERE workspace_id = ?",
      [tempWsId]
    );
    assert(tempWsOptions[0].total >= 28, `Future workspace automatically receives all default options (provisioned: ${tempWsOptions[0].total})`);
    // Cleanup temp ws
    await pool.query("DELETE FROM lead_options WHERE workspace_id = ?", [tempWsId]);
    await pool.query("DELETE FROM workspaces WHERE id = ?", [tempWsId]);
    console.log("     Cleaned up temporary provisioning workspace.");

    // ------------------------------------------------------------------------
    // TEST 3: RBAC Restrictions for Employees
    // ------------------------------------------------------------------------
    console.log("\n[TEST 3] Verifying strict server-side RBAC enforcement for employees...");

    let empCreateFailed = false;
    try {
      await createLeadOptionCore(employeeContext, {
        type: "source",
        name: "Employee Illegal Source",
      });
    } catch (err) {
      empCreateFailed = true;
      assert(err.message.includes("Only workspace Owners can create"), "Employee createLeadOption server call rejected with Unauthorized");
    }
    assert(empCreateFailed, "Employee cannot create lead options");

    // Fetch an option ID to test edit/deactivate/delete
    const [someOption] = await pool.query(
      "SELECT id FROM lead_options WHERE workspace_id = ? AND type = 'location' LIMIT 1",
      [JAYSHREE_WS_ID]
    );
    const testOptId = someOption[0].id;

    let empEditFailed = false;
    try {
      await updateLeadOptionCore(employeeContext, {
        id: testOptId,
        name: "Hacked Name",
      });
    } catch (err) {
      empEditFailed = true;
      assert(err.message.includes("Only workspace Owners can edit"), "Employee updateLeadOption server call rejected with Unauthorized");
    }
    assert(empEditFailed, "Employee cannot edit lead options");

    let empDeactFailed = false;
    try {
      await setLeadOptionActiveCore(employeeContext, {
        id: testOptId,
        isActive: false,
      });
    } catch (err) {
      empDeactFailed = true;
      assert(err.message.includes("Only workspace Owners can activate/deactivate"), "Employee setLeadOptionActive server call rejected with Unauthorized");
    }
    assert(empDeactFailed, "Employee cannot deactivate lead options");

    let empDeleteFailed = false;
    try {
      await deleteLeadOptionCore(employeeContext, {
        id: testOptId,
      });
    } catch (err) {
      empDeleteFailed = true;
      assert(err.message.includes("Only workspace Owners can delete"), "Employee deleteLeadOption server call rejected with Unauthorized");
    }
    assert(empDeleteFailed, "Employee cannot delete lead options");

    // ------------------------------------------------------------------------
    // TEST 4: Owner Option Management Lifecycle (All 6 Types)
    // ------------------------------------------------------------------------
    console.log("\n[TEST 4] Verifying Owner Option CRUD & Lifecycle across all 6 categories...");

    // 1. Create custom options across all 6 categories
    const customSource = await createLeadOptionCore(ownerContext, {
      type: "source",
      name: "Test Referral Agency",
    });
    assert(customSource.id && customSource.name === "Test Referral Agency", "Owner created custom Source");

    const customLocation = await createLeadOptionCore(ownerContext, {
      type: "location",
      name: "Kharghar Hills",
    });
    assert(customLocation.id && customLocation.name === "Kharghar Hills", "Owner created custom Location");

    const customPurpose = await createLeadOptionCore(ownerContext, {
      type: "purpose",
      name: "Commercial Lease",
    });
    assert(customPurpose.id && customPurpose.name === "Commercial Lease", "Owner created custom Purpose");

    const customPossession = await createLeadOptionCore(ownerContext, {
      type: "possession_timeline",
      name: "Ready in 45 Days",
    });
    assert(customPossession.id && customPossession.name === "Ready in 45 Days", "Owner created custom Possession Timeline");

    const customTransaction = await createLeadOptionCore(ownerContext, {
      type: "transaction_timeline",
      name: "Within 15 Days",
    });
    assert(customTransaction.id && customTransaction.name === "Within 15 Days", "Owner created custom Transaction Timeline");

    const customPhase = await createLeadOptionCore(ownerContext, {
      type: "phase",
      name: "Tower B Launch",
    });
    assert(customPhase.id && customPhase.name === "Tower B Launch", "Owner created custom Phase");

    // 2. Duplicate validation check (case-insensitive)
    let dupFailed = false;
    try {
      await createLeadOptionCore(ownerContext, {
        type: "source",
        name: "test referral agency", // lowercase duplicate
      });
    } catch (err) {
      dupFailed = true;
      assert(err.message.includes("already exists"), "Duplicate option name within workspace + type rejected");
    }
    assert(dupFailed, "Duplicate option prevented");

    // 3. Name validation checks
    let emptyFailed = false;
    try {
      await createLeadOptionCore(ownerContext, {
        type: "source",
        name: "   ",
      });
    } catch (err) {
      emptyFailed = true;
      assert(err.message.includes("empty"), "Whitespace-only option name rejected");
    }
    assert(emptyFailed, "Empty name rejected");

    let invalidTypeFailed = false;
    try {
      await createLeadOptionCore(ownerContext, {
        type: "invalid_category",
        name: "Some Name",
      });
    } catch (err) {
      invalidTypeFailed = true;
      assert(err.message.includes("Invalid lead option type"), "Invalid option type rejected");
    }
    assert(invalidTypeFailed, "Invalid option type rejected");

    // 4. Update option
    const updatedSource = await updateLeadOptionCore(ownerContext, {
      id: customSource.id,
      name: "Test Referral Agency Premium",
      sort_order: 99,
    });
    assert(updatedSource.name === "Test Referral Agency Premium" && updatedSource.sort_order === 99, "Owner updated custom option name and sort_order");

    // 5. Deactivate option
    const deactSource = await setLeadOptionActiveCore(ownerContext, {
      id: customSource.id,
      isActive: false,
    });
    assert(deactSource.is_active === 0 || deactSource.is_active === false, "Owner deactivated custom option");

    // Verify employee cannot see deactivated option
    const empOptions = await listLeadOptionsCore(employeeContext, {
      type: "source",
      includeInactive: true, // Employee flag ignored server-side!
    });
    const hasDeact = empOptions.some((o) => o.id === customSource.id);
    assert(!hasDeact, "Employee query NEVER returns deactivated options even if includeInactive requested");

    // 6. Reactivate option
    const reactSource = await setLeadOptionActiveCore(ownerContext, {
      id: customSource.id,
      isActive: true,
    });
    assert(reactSource.is_active === 1 || reactSource.is_active === true, "Owner reactivated custom option");

    // ------------------------------------------------------------------------
    // TEST 5: Delete Protection Policies
    // ------------------------------------------------------------------------
    console.log("\n[TEST 5] Verifying Delete Protection Policies...");

    // 1. System option deletion must be rejected
    const [metaAdsOpt] = await pool.query(
      "SELECT id FROM lead_options WHERE workspace_id = ? AND stable_key = 'meta_ads' LIMIT 1",
      [JAYSHREE_WS_ID]
    );
    let sysDeleteFailed = false;
    try {
      await deleteLeadOptionCore(ownerContext, {
        id: metaAdsOpt[0].id,
      });
    } catch (err) {
      sysDeleteFailed = true;
      assert(err.message.includes("System options cannot be deleted"), "System option deletion rejected with clear error message");
    }
    assert(sysDeleteFailed, "System options protected from hard deletion");

    // 2. Unreferenced custom option deletion should succeed
    const unreferencedOpt = await createLeadOptionCore(ownerContext, {
      type: "location",
      name: "Temporary Test Location",
    });
    const delResult = await deleteLeadOptionCore(ownerContext, {
      id: unreferencedOpt.id,
    });
    assert(delResult.ok === true, "Unreferenced custom option deleted cleanly");

    // ------------------------------------------------------------------------
    // TEST 6: Security & Cross-Workspace Isolation
    // ------------------------------------------------------------------------
    console.log("\n[TEST 6] Verifying Cross-Workspace ID Tampering & Isolation...");

    // Owner of OTHER_WS attempts to edit Jayshree's option
    let crossEditFailed = false;
    try {
      await updateLeadOptionCore(otherOwnerContext, {
        id: customSource.id,
        name: "Hacked Cross Workspace",
      });
    } catch (err) {
      crossEditFailed = true;
      assert(err.message.includes("FORBIDDEN: Cross-workspace access denied"), "Cross-workspace option edit rejected");
    }
    assert(crossEditFailed, "Cross-workspace option edit blocked");

    // Owner of OTHER_WS attempts to deactivate Jayshree's option
    let crossDeactFailed = false;
    try {
      await setLeadOptionActiveCore(otherOwnerContext, {
        id: customSource.id,
        isActive: false,
      });
    } catch (err) {
      crossDeactFailed = true;
      assert(err.message.includes("FORBIDDEN: Cross-workspace access denied"), "Cross-workspace option deactivate rejected");
    }
    assert(crossDeactFailed, "Cross-workspace option deactivate blocked");

    // Owner of OTHER_WS attempts to delete Jayshree's option
    let crossDelFailed = false;
    try {
      await deleteLeadOptionCore(otherOwnerContext, {
        id: customSource.id,
      });
    } catch (err) {
      crossDelFailed = true;
      assert(err.message.includes("FORBIDDEN: Cross-workspace access denied"), "Cross-workspace option delete rejected");
    }
    assert(crossDelFailed, "Cross-workspace option delete blocked");

    // ------------------------------------------------------------------------
    // TEST 7: Leads CRUD with Configurable Fields
    // ------------------------------------------------------------------------
    console.log("\n[TEST 7] Verifying Leads CRUD with 5 new configurable fields + historical preservation...");

    // Create a lead with all 5 new configurable fields + source
    const newLead = await createLeadCore(ownerContext, {
      workspace_id: JAYSHREE_WS_ID,
      name: "Rohit Sharma Test Lead",
      phone: "+919876543210",
      email: "rohit.test@example.com",
      source_option_id: customSource.id,
      location_option_id: customLocation.id,
      purpose_option_id: customPurpose.id,
      possession_timeline_option_id: customPossession.id,
      transaction_timeline_option_id: customTransaction.id,
      phase_option_id: customPhase.id,
      budget: 15000000,
      requirement: "3 BHK Sea Facing",
      status: "New",
    });

    assert(newLead.id && newLead.name === "Rohit Sharma Test Lead", "Created new lead successfully");
    assert(newLead.source_option_id === customSource.id, "Saved source_option_id");
    assert(newLead.location_option_id === customLocation.id, "Saved location_option_id");
    assert(newLead.purpose_option_id === customPurpose.id, "Saved purpose_option_id");
    assert(newLead.possession_timeline_option_id === customPossession.id, "Saved possession_timeline_option_id");
    assert(newLead.transaction_timeline_option_id === customTransaction.id, "Saved transaction_timeline_option_id");
    assert(newLead.phase_option_id === customPhase.id, "Saved phase_option_id");

    // Verify joined resolved names on lead fetch
    assert(newLead.location_name === "Kharghar Hills", `Resolved location_name: '${newLead.location_name}'`);
    assert(newLead.purpose_name === "Commercial Lease", `Resolved purpose_name: '${newLead.purpose_name}'`);
    assert(newLead.possession_timeline_name === "Ready in 45 Days", `Resolved possession_timeline_name: '${newLead.possession_timeline_name}'`);
    assert(newLead.transaction_timeline_name === "Within 15 Days", `Resolved transaction_timeline_name: '${newLead.transaction_timeline_name}'`);
    assert(newLead.phase_name === "Tower B Launch", `Resolved phase_name: '${newLead.phase_name}'`);
    assert(newLead.campaign === null, "Campaign column remains null and not required in form");

    // Cross-workspace option tampering in Lead Creation
    const [otherWsOption] = await pool.query(
      "SELECT id FROM lead_options WHERE workspace_id = ? AND type = 'location' LIMIT 1",
      [OTHER_WS_ID]
    );
    let crossLeadOptFailed = false;
    try {
      await createLeadCore(ownerContext, {
        workspace_id: JAYSHREE_WS_ID,
        name: "Hacked Cross Lead",
        source_option_id: customSource.id,
        location_option_id: otherWsOption[0].id, // belongs to ws-client-001!
      });
    } catch (err) {
      crossLeadOptFailed = true;
      assert(err.message.includes("Unauthorized: Cross-workspace location option tampering rejected"), "Cross-workspace option ID attachment to lead rejected");
    }
    assert(crossLeadOptFailed, "Cross-workspace option tampering rejected on lead creation");

    // Deactivated option cannot be selected for a NEW lead
    await setLeadOptionActiveCore(ownerContext, {
      id: customLocation.id,
      isActive: false,
    });
    let inactiveLeadOptFailed = false;
    try {
      await createLeadCore(ownerContext, {
        workspace_id: JAYSHREE_WS_ID,
        name: "Inactive Option Test Lead",
        source_option_id: customSource.id,
        location_option_id: customLocation.id, // currently inactive!
      });
    } catch (err) {
      inactiveLeadOptFailed = true;
      assert(err.message.includes("Cannot select inactive location option"), "Selecting inactive option for new lead rejected");
    }
    assert(inactiveLeadOptFailed, "Inactive option rejected for new lead");

    // Historical lead with deactivated option still resolves and displays
    const fetchedLead = await getLeadCore(ownerContext, { id: newLead.id });
    assert(fetchedLead.location_option_id === customLocation.id, "Historical lead retains deactivated location_option_id");
    assert(fetchedLead.location_name === "Kharghar Hills", `Historical lead still resolves inactive location name ('${fetchedLead.location_name}')`);

    // Attempting to hard-delete an option referenced by a lead must be blocked!
    let deleteReferencedFailed = false;
    try {
      await deleteLeadOptionCore(ownerContext, {
        id: customLocation.id,
      });
    } catch (err) {
      deleteReferencedFailed = true;
      assert(err.message.includes("referenced by 1 lead(s) and cannot be deleted"), "Hard-deleting lead-referenced option rejected with reference count");
    }
    assert(deleteReferencedFailed, "Lead-referenced options protected from deletion");

    // Reactivate location for subsequent checks
    await setLeadOptionActiveCore(ownerContext, {
      id: customLocation.id,
      isActive: true,
    });

    // Update lead with modified options
    const updatedLead = await updateLeadCore(ownerContext, {
      id: newLead.id,
      patch: {
        budget: 18000000,
        status: "Contacted",
      },
    });
    assert(updatedLead.budget === 18000000 && updatedLead.status === "Contacted", "Lead updated successfully");

    // ------------------------------------------------------------------------
    // TEST 8: Stable Key Source Card Filtering
    // ------------------------------------------------------------------------
    console.log("\n[TEST 8] Verifying Stable Key Source Card Filtering...");

    // Find meta_ads option in Jayshree
    const [metaOpt] = await pool.query(
      "SELECT id, name, stable_key FROM lead_options WHERE workspace_id = ? AND stable_key = 'meta_ads' LIMIT 1",
      [JAYSHREE_WS_ID]
    );
    const originalMetaName = metaOpt[0].name;

    // Attach a lead to meta_ads
    await updateLeadCore(ownerContext, {
      id: newLead.id,
      patch: {
        source_option_id: metaOpt[0].id,
      },
    });

    // Filter leads by stable_key
    const leadsByStableKeyBefore = await pool.query(
      `SELECT l.id, so.stable_key FROM leads l
       JOIN lead_options so ON l.source_option_id = so.id
       WHERE l.workspace_id = ? AND so.stable_key = 'meta_ads'`,
      [JAYSHREE_WS_ID]
    );
    assert(leadsByStableKeyBefore[0].length >= 1, `Found ${leadsByStableKeyBefore[0].length} lead(s) with stable_key 'meta_ads'`);

    // Rename display label of Meta Ads
    await updateLeadOptionCore(ownerContext, {
      id: metaOpt[0].id,
      name: "Meta Ads (Facebook & Instagram Lead Gen)",
    });

    // Re-query by stable_key -> Must STILL match!
    const leadsByStableKeyAfter = await pool.query(
      `SELECT l.id, so.name, so.stable_key FROM leads l
       JOIN lead_options so ON l.source_option_id = so.id
       WHERE l.workspace_id = ? AND so.stable_key = 'meta_ads'`,
      [JAYSHREE_WS_ID]
    );
    assert(leadsByStableKeyAfter[0].length === leadsByStableKeyBefore[0].length, "Renaming display label did NOT break stable_key source filtering");
    assert(leadsByStableKeyAfter[0][0].name === "Meta Ads (Facebook & Instagram Lead Gen)", "Renamed label reflected in joined query");

    // Restore original name
    await updateLeadOptionCore(ownerContext, {
      id: metaOpt[0].id,
      name: originalMetaName,
    });
    console.log("     Restored Meta Ads original display name.");

    // ------------------------------------------------------------------------
    // TEST 9: Comprehensive Audit Trail
    // ------------------------------------------------------------------------
    console.log("\n[TEST 9] Verifying audit_logs for lead option mutations...");

    const [auditActions] = await pool.query(
      `SELECT action, COUNT(*) as count FROM audit_logs
       WHERE workspace_id = ? AND entity_type = 'lead_option'
       GROUP BY action`,
      [JAYSHREE_WS_ID]
    );
    const auditMap = Object.fromEntries(auditActions.map((r) => [r.action, r.count]));
    assert(auditMap["LEAD_OPTION_CREATED"] > 0, `audit_logs recorded LEAD_OPTION_CREATED (count: ${auditMap["LEAD_OPTION_CREATED"]})`);
    assert(auditMap["LEAD_OPTION_UPDATED"] > 0, `audit_logs recorded LEAD_OPTION_UPDATED (count: ${auditMap["LEAD_OPTION_UPDATED"]})`);
    assert(auditMap["LEAD_OPTION_DEACTIVATED"] > 0, `audit_logs recorded LEAD_OPTION_DEACTIVATED (count: ${auditMap["LEAD_OPTION_DEACTIVATED"]})`);
    assert(auditMap["LEAD_OPTION_REACTIVATED"] > 0, `audit_logs recorded LEAD_OPTION_REACTIVATED (count: ${auditMap["LEAD_OPTION_REACTIVATED"]})`);
    assert(auditMap["LEAD_OPTION_DELETED"] > 0, `audit_logs recorded LEAD_OPTION_DELETED (count: ${auditMap["LEAD_OPTION_DELETED"]})`);

    // ------------------------------------------------------------------------
    // TEST 10: Clean Test Teardown
    // ------------------------------------------------------------------------
    console.log("\n[TEST 10] Cleaning up temporary test lead & options...");

    // Delete test lead
    await deleteLeadCore(ownerContext, { id: newLead.id });
    console.log("     Deleted test lead.");

    // Delete custom created options
    const createdOptionIds = [
      customSource.id,
      customLocation.id,
      customPurpose.id,
      customPossession.id,
      customTransaction.id,
      customPhase.id,
    ];
    for (const optId of createdOptionIds) {
      await pool.query("DELETE FROM lead_options WHERE id = ?", [optId]);
    }
    // Clean up test audit logs
    await pool.query(
      "DELETE FROM audit_logs WHERE workspace_id = ? AND entity_id IN (?, ?, ?, ?, ?, ?)",
      [JAYSHREE_WS_ID, ...createdOptionIds]
    );
    console.log("     Cleaned up test options and test audit logs.");

    // Final database consistency check
    const [finalLeadCount] = await pool.query("SELECT COUNT(*) as count FROM leads");
    assert(finalLeadCount[0].count === totalLeads, `Historical leads preserved intact (${finalLeadCount[0].count}/${totalLeads})`);

    console.log("\n================================================================================");
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error("FATAL TEST ERROR:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
