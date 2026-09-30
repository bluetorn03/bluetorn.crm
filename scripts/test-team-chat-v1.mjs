/**
 * BLUETORN CRM — TEAM CHAT V1 MASTER INTEGRATION TEST SUITE
 *
 * Verifies real MySQL database behavior, authentication, workspace security,
 * retention policy enforcement, cleanup engine, deactivated user handling,
 * and multi-tenant isolation.
 *
 * Usage:
 *   node scripts/test-team-chat-v1.mjs
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  listChatConversationsCore,
  getChatMessagesCore,
  sendChatMessageCore,
  markConversationReadCore,
  getChatUnreadCountCore,
  updateWorkspaceRetentionPolicyCore,
  getWorkspaceRetentionPolicyCore,
  listAvailableChatUsersCore,
} from "../src/lib/chat.functions.ts";
import { cleanupExpiredChatMessages } from "../src/lib/chat-cleanup.ts";

const sendChatMessageFn = (args) => sendChatMessageCore(args.context, args.data);
const getChatMessagesFn = (args) => getChatMessagesCore(args.context, args.data);
const listChatConversationsFn = (args) => listChatConversationsCore(args.context || args);
const markConversationReadFn = (args) => markConversationReadCore(args.context, args.data);
const getChatUnreadCountFn = (args) => getChatUnreadCountCore(args.context || args);
const listAvailableChatUsersFn = (args) => listAvailableChatUsersCore(args.context || args);
const getWorkspaceRetentionPolicyFn = (args) => getWorkspaceRetentionPolicyCore(args?.context, args?.data);
const updateWorkspaceRetentionPolicyFn = (args) => updateWorkspaceRetentionPolicyCore(args.context, args.data);

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

const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT) || 3306;
const database = process.env.DB_NAME || "bluetorn_crm";
const user = process.env.DB_USER || "root";
const password = process.env.DB_PASSWORD ?? "";

async function main() {
  console.log("==================================================");
  console.log("🚀 BLUETORN CRM — TEAM CHAT V1 INTEGRATION TEST SUITE");
  console.log("==================================================\n");

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
  });

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

  try {
    // --------------------------------------------------------------------------
    // Resolve test accounts from MySQL (.antigravity.local.md accounts)
    // --------------------------------------------------------------------------
    const [jayshreeWs] = await pool.query(
      "SELECT id, code, chat_retention_days FROM workspaces WHERE code = 'JAYSHREE' LIMIT 1",
    );
    const [otherWs] = await pool.query(
      "SELECT id, code, chat_retention_days FROM workspaces WHERE code = 'BT-TEST-001' LIMIT 1",
    );
    const [platformWs] = await pool.query(
      "SELECT id, code FROM workspaces WHERE code = 'BLUETORN' LIMIT 1",
    );

    const wsJayshreeId = jayshreeWs[0].id;
    const wsOtherId = otherWs[0].id;
    const wsPlatformId = platformWs[0].id;

    const [jayshreeUsers] = await pool.query(
      "SELECT id, user_code, full_name, is_active FROM profiles WHERE workspace_id = ?",
      [wsJayshreeId],
    );
    const [otherUsers] = await pool.query(
      "SELECT id, user_code, full_name, is_active FROM profiles WHERE workspace_id = ?",
      [wsOtherId],
    );
    const [adminUsers] = await pool.query(
      "SELECT p.id, p.user_code FROM profiles p JOIN user_roles r ON p.id = r.user_id WHERE r.role = 'super_admin' LIMIT 1",
    );

    const ownerProfile = jayshreeUsers.find((u) => u.user_code === "jayshree.realty");
    const emp1Profile = jayshreeUsers.find((u) => u.user_code === "jayshree.sales");
    const emp2Profile = jayshreeUsers.find((u) => u.user_code === "jayshree.realty2");
    const otherOwnerProfile = otherUsers.find((u) => u.user_code === "testowner");
    const superAdminProfile = adminUsers[0];

    assert(!!ownerProfile, "Found Owner (jayshree.realty)");
    assert(!!emp1Profile, "Found Employee 1 (jayshree.sales)");
    assert(!!emp2Profile, "Found Employee 2 (jayshree.realty2)");
    assert(!!otherOwnerProfile, "Found Other Workspace Owner (testowner)");
    assert(!!superAdminProfile, "Found Super Admin (testadmin)");

    // Context objects replicating requireMySqlAuth middleware
    const ownerCtx = {
      context: {
        userId: ownerProfile.id,
        workspaceId: wsJayshreeId,
        role: "owner",
        isViewingAs: false,
        realUserId: ownerProfile.id,
        realRole: "owner",
      },
    };

    const emp1Ctx = {
      context: {
        userId: emp1Profile.id,
        workspaceId: wsJayshreeId,
        role: "employee",
        isViewingAs: false,
        realUserId: emp1Profile.id,
        realRole: "employee",
      },
    };

    const emp2Ctx = {
      context: {
        userId: emp2Profile.id,
        workspaceId: wsJayshreeId,
        role: "employee",
        isViewingAs: false,
        realUserId: emp2Profile.id,
        realRole: "employee",
      },
    };

    const otherOwnerCtx = {
      context: {
        userId: otherOwnerProfile.id,
        workspaceId: wsOtherId,
        role: "owner",
        isViewingAs: false,
        realUserId: otherOwnerProfile.id,
        realRole: "owner",
      },
    };

    const superAdminCtx = {
      context: {
        userId: superAdminProfile.id,
        workspaceId: wsPlatformId,
        role: "super_admin",
        isViewingAs: false,
        realUserId: superAdminProfile.id,
        realRole: "super_admin",
      },
    };

    // --------------------------------------------------------------------------
    // TEST 1: Owner ↔ Employee 1:1 Chat
    // --------------------------------------------------------------------------
    console.log("\n[TEST 1] Owner ↔ Employee 1:1 Conversation & Messaging");

    // Owner sends message to Employee 1
    const sendRes1 = await sendChatMessageFn({
      data: {
        recipientId: emp1Profile.id,
        body: "Hello Employee 1, this is the owner testing Team Chat V1.",
      },
      ...ownerCtx,
    });

    assert(!!sendRes1.conversationId, "Conversation created/resolved with conversationId");
    assert(!!sendRes1.message.id, "Message inserted into MySQL");
    assert(sendRes1.message.sender_id === ownerProfile.id, "Sender ID matches Owner");
    assert(sendRes1.message.receiver_id === emp1Profile.id, "Receiver ID matches Employee 1");
    assert(sendRes1.message.is_read === 0, "Initial is_read state is 0 (unread)");

    const convId = sendRes1.conversationId;

    // Verify unread count for Employee 1
    const unreadRes1 = await getChatUnreadCountFn(emp1Ctx);
    assert(unreadRes1.unreadCount >= 1, `Employee 1 unread count is >= 1 (got: ${unreadRes1.unreadCount})`);

    // Employee 1 views conversation messages
    const chatDetails1 = await getChatMessagesFn({
      data: { conversationId: convId },
      ...emp1Ctx,
    });

    assert(chatDetails1.messages.length >= 1, "Messages fetched for conversation");
    assert(
      chatDetails1.participant.id === ownerProfile.id,
      "Participant for Employee 1 correctly identifies Owner",
    );

    // After viewing, message should be marked read
    const [msgRow] = await pool.query(
      "SELECT is_read, read_at FROM chat_messages WHERE id = ?",
      [sendRes1.message.id],
    );
    assert(msgRow[0].is_read === 1, "Message marked is_read = 1 after viewing");
    assert(!!msgRow[0].read_at, "read_at timestamp recorded");

    // Employee 1 replies back to Owner
    const sendRes2 = await sendChatMessageFn({
      data: {
        conversationId: convId,
        body: "Received loud and clear, Owner! Replying back.",
      },
      ...emp1Ctx,
    });

    assert(sendRes2.conversationId === convId, "Reply placed in same conversation");
    assert(sendRes2.message.sender_id === emp1Profile.id, "Reply sender is Employee 1");
    assert(sendRes2.message.receiver_id === ownerProfile.id, "Reply receiver is Owner");

    // --------------------------------------------------------------------------
    // TEST 2: Employee ↔ Employee 1:1 Chat
    // --------------------------------------------------------------------------
    console.log("\n[TEST 2] Employee ↔ Employee 1:1 Conversation");

    const empToEmpRes = await sendChatMessageFn({
      data: {
        recipientId: emp2Profile.id,
        body: "Hey colleague, let's sync on the new lead.",
      },
      ...emp1Ctx,
    });

    assert(!!empToEmpRes.conversationId, "Employee ↔ Employee conversation created");
    assert(empToEmpRes.message.sender_id === emp1Profile.id, "Sender is Employee 1");
    assert(empToEmpRes.message.receiver_id === emp2Profile.id, "Receiver is Employee 2");

    // Employee 2 lists conversations
    const emp2Convs = await listChatConversationsFn(emp2Ctx);
    const foundEmp2Conv = emp2Convs.find((c) => c.id === empToEmpRes.conversationId);
    assert(!!foundEmp2Conv, "Employee 2 finds new conversation in conversation list");
    assert(
      foundEmp2Conv.participant.id === emp1Profile.id,
      "Employee 2's participant is Employee 1",
    );

    // --------------------------------------------------------------------------
    // TEST 3: Workspace Isolation & Security Protection
    // --------------------------------------------------------------------------
    console.log("\n[TEST 3] Security: Cross-Workspace, Non-Participant & IDOR Access Denial");

    // 3a. Cross-workspace access denial: Other workspace Owner tries to read JAYSHREE chat
    let crossWsBlocked = false;
    try {
      await getChatMessagesFn({
        data: { conversationId: convId },
        ...otherOwnerCtx,
      });
    } catch (err) {
      crossWsBlocked = true;
    }
    assert(crossWsBlocked, "Cross-workspace conversation read correctly blocked (403/Forbidden)");

    // 3b. Cross-workspace message sending denial
    let crossWsSendBlocked = false;
    try {
      await sendChatMessageFn({
        data: {
          conversationId: convId,
          body: "Hacked cross-workspace message!",
        },
        ...otherOwnerCtx,
      });
    } catch (err) {
      crossWsSendBlocked = true;
    }
    assert(crossWsSendBlocked, "Cross-workspace message sending correctly blocked");

    // 3c. Non-participant in same workspace tries to read conversation
    // (Employee 2 tries to read Owner ↔ Employee 1 conversation)
    let nonParticipantBlocked = false;
    try {
      await getChatMessagesFn({
        data: { conversationId: convId },
        ...emp2Ctx,
      });
    } catch (err) {
      nonParticipantBlocked = true;
    }
    assert(nonParticipantBlocked, "Non-participant in same workspace denied conversation access");

    // 3d. Check security audit log was written for unauthorized attempt
    const [securityAudits] = await pool.query(
      "SELECT * FROM audit_logs WHERE action IN ('chat.cross_workspace_denied', 'chat.unauthorized_participant_denied') ORDER BY created_at DESC LIMIT 5",
    );
    assert(securityAudits.length > 0, "Security violations logged to audit_logs table");

    // 3e. View-as preview mode blocks message sending
    let previewBlocked = false;
    try {
      await sendChatMessageFn({
        data: {
          conversationId: convId,
          body: "Trying to send while viewing as employee",
        },
        context: {
          ...ownerCtx.context,
          isViewingAs: true,
        },
      });
    } catch (err) {
      previewBlocked = true;
    }
    assert(previewBlocked, "Sending message blocked in read-only view-as preview mode");

    // --------------------------------------------------------------------------
    // TEST 4: Deactivated User Protection
    // --------------------------------------------------------------------------
    console.log("\n[TEST 4] Deactivated User Handling");

    // Deactivate Employee 2 temporarily
    await pool.query("UPDATE profiles SET is_active = 0 WHERE id = ?", [emp2Profile.id]);

    // Deactivated user cannot send message
    let deactSenderBlocked = false;
    try {
      await sendChatMessageFn({
        data: {
          conversationId: empToEmpRes.conversationId,
          body: "Sending from deactivated account",
        },
        ...emp2Ctx,
      });
    } catch (err) {
      deactSenderBlocked = true;
    }
    assert(deactSenderBlocked, "Deactivated employee blocked from sending messages");

    // Active user cannot send message to deactivated employee
    let deactReceiverBlocked = false;
    try {
      await sendChatMessageFn({
        data: {
          conversationId: empToEmpRes.conversationId,
          body: "Trying to message deactivated employee",
        },
        ...emp1Ctx,
      });
    } catch (err) {
      deactReceiverBlocked = true;
    }
    assert(deactReceiverBlocked, "Sending message to deactivated employee blocked");

    // Re-activate Employee 2
    await pool.query("UPDATE profiles SET is_active = 1 WHERE id = ?", [emp2Profile.id]);
    assert(true, "Re-activated Employee 2 for subsequent tests");

    // --------------------------------------------------------------------------
    // TEST 5: Retention Policy Enforcement & Cleanup
    // --------------------------------------------------------------------------
    console.log("\n[TEST 5] Retention Policy & Server-Side Cleanup");

    // Verify message expires_at calculation: created_at + retentionDays
    const [retentionMsg] = await pool.query(
      "SELECT created_at, expires_at FROM chat_messages WHERE id = ?",
      [sendRes1.message.id],
    );
    const createdDate = new Date(retentionMsg[0].created_at);
    const expiresDate = new Date(retentionMsg[0].expires_at);
    const diffDays = Math.round((expiresDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays === 15, `Message expires_at is exactly 15 days from created_at (calculated: ${diffDays} days)`);

    // Owner cannot change retention policy
    let ownerRetentionBlocked = false;
    try {
      await updateWorkspaceRetentionPolicyFn({
        data: { workspaceId: wsJayshreeId, retentionDays: 7 },
        ...ownerCtx,
      });
    } catch (err) {
      ownerRetentionBlocked = true;
    }
    assert(ownerRetentionBlocked, "Owner blocked from changing retention policy (Super Admin only)");

    // Super Admin cannot set retention > 15 days
    let aboveMaxBlocked = false;
    try {
      await updateWorkspaceRetentionPolicyFn({
        data: { workspaceId: wsJayshreeId, retentionDays: 30 },
        ...superAdminCtx,
      });
    } catch (err) {
      aboveMaxBlocked = true;
    }
    assert(aboveMaxBlocked, "Retention > 15 days rejected (system maximum: 15 days)");

    // Super Admin updates retention to 7 days
    const updateRetRes = await updateWorkspaceRetentionPolicyFn({
      data: { workspaceId: wsJayshreeId, retentionDays: 7 },
      ...superAdminCtx,
    });
    assert(updateRetRes.success, "Super Admin successfully configured 7 days retention");

    const [wsRowAfter] = await pool.query(
      "SELECT chat_retention_days FROM workspaces WHERE id = ?",
      [wsJayshreeId],
    );
    assert(wsRowAfter[0].chat_retention_days === 7, "Workspace chat_retention_days updated in MySQL to 7");

    // Verify audit log for retention change
    const [retAudits] = await pool.query(
      "SELECT * FROM audit_logs WHERE action = 'chat.retention_updated' AND workspace_id = ? ORDER BY created_at DESC LIMIT 1",
      [wsJayshreeId],
    );
    assert(retAudits.length > 0, "Retention policy update logged to audit_logs");

    // Artificially insert an expired message to test scheduled cleanup
    const testExpiredId = "test-expired-msg-" + Date.now();
    await pool.query(
      `INSERT INTO chat_messages (id, workspace_id, conversation_id, sender_id, receiver_id, body, is_read, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'This message is expired', 0, UTC_TIMESTAMP() - INTERVAL 10 DAY, UTC_TIMESTAMP() - INTERVAL 2 HOUR)`,
      [testExpiredId, wsJayshreeId, convId, ownerProfile.id, emp1Profile.id],
    );

    // Verify message exists before cleanup
    const [beforeCleanup] = await pool.query(
      "SELECT id FROM chat_messages WHERE id = ?",
      [testExpiredId],
    );
    assert(beforeCleanup.length === 1, "Expired test message inserted into MySQL");

    // Run cleanup engine
    const cleanupResult = await cleanupExpiredChatMessages();
    assert(cleanupResult.deletedCount >= 1, `Cleanup executed and deleted ${cleanupResult.deletedCount} expired messages`);

    // Verify expired message is permanently deleted from MySQL
    const [afterCleanup] = await pool.query(
      "SELECT id FROM chat_messages WHERE id = ?",
      [testExpiredId],
    );
    assert(afterCleanup.length === 0, "Expired message was ACTUALLY deleted from MySQL");

    // Verify audit logs were NOT deleted by cleanup
    const [auditsAfter] = await pool.query("SELECT COUNT(*) as count FROM audit_logs");
    assert(auditsAfter[0].count > 0, "Audit logs were NOT touched by chat cleanup");

    // Restore workspace retention to 15 days
    await updateWorkspaceRetentionPolicyFn({
      data: { workspaceId: wsJayshreeId, retentionDays: 15 },
      ...superAdminCtx,
    });
    assert(true, "Restored Jayshree workspace retention to 15 days");

    // --------------------------------------------------------------------------
    // TEST 6: Multi-Tenant Architecture & Future Workspaces
    // --------------------------------------------------------------------------
    console.log("\n[TEST 6] Multi-Tenant Architecture & Future Workspaces Default");

    const futureWsId = "ws-future-test-" + Date.now();
    await pool.query(
      `INSERT INTO workspaces (id, code, name, industry, plan, status, currency, timezone, seat_limit)
       VALUES (?, 'FUTURE-WS', 'Future Workspace Agency', 'Real Estate', 'Starter', 'active', 'INR', 'Asia/Kolkata', 10)`,
      [futureWsId],
    );

    const [futureWsRow] = await pool.query(
      "SELECT chat_retention_days FROM workspaces WHERE id = ?",
      [futureWsId],
    );
    assert(
      futureWsRow[0].chat_retention_days === 15,
      `New workspace automatically receives 15 days default retention (got: ${futureWsRow[0].chat_retention_days})`,
    );

    // Clean up future test workspace
    await pool.query("DELETE FROM workspaces WHERE id = ?", [futureWsId]);
    assert(true, "Future test workspace cleaned up cleanly");

    console.log("\n==================================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
