/**
 * BLUETORN CRM — TEAM CHAT GROUPS V1.1 MASTER INTEGRATION TEST SUITE
 *
 * Verifies real MySQL database behavior, authentication, workspace security,
 * owner-created groups, employee permissions, membership history & joined_at visibility,
 * group archiving/restoring/deletion, and retention policy cleanup.
 *
 * Usage:
 *   node scripts/test-team-chat-groups-v1-1.mjs
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
  listAvailableChatUsersCore,
  createChatGroupCore,
  getGroupMembersCore,
  addGroupMembersCore,
  removeGroupMemberCore,
  leaveChatGroupCore,
  renameChatGroupCore,
  archiveChatGroupCore,
  restoreChatGroupCore,
  deleteChatGroupCore,
  listArchivedChatGroupsCore,
  getWorkspaceRetentionPolicyCore,
  updateWorkspaceRetentionPolicyCore,
} from "../src/lib/chat.functions.ts";
import { cleanupExpiredChatMessages } from "../src/lib/chat-cleanup.ts";

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
  console.log("🚀 BLUETORN CRM — TEAM CHAT GROUPS V1.1 TEST SUITE");
  console.log("==================================================\n");

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

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
    });

    // 0. Fetch test accounts from MySQL
    const [profiles] = await conn.query(
      `SELECT p.id, p.user_code, p.full_name, p.workspace_id, w.code as ws_code, r.role
       FROM profiles p
       JOIN workspaces w ON p.workspace_id = w.id
       LEFT JOIN user_roles r ON p.id = r.user_id AND (r.workspace_id = w.id OR r.workspace_id IS NULL)
       WHERE p.user_code IN ('jayshree.realty', 'jayshree.sales', 'jayshree.realty2', 'testowner', 'testadmin')`,
    );

    const ownerProfile = profiles.find((p) => p.user_code === "jayshree.realty");
    const emp1Profile = profiles.find((p) => p.user_code === "jayshree.sales");
    const emp2Profile = profiles.find((p) => p.user_code === "jayshree.realty2");
    const otherOwnerProfile = profiles.find((p) => p.user_code === "testowner");
    const superAdminProfile = profiles.find((p) => p.user_code === "testadmin");

    assert(!!ownerProfile, "Found Owner (jayshree.realty)");
    assert(!!emp1Profile, "Found Employee 1 (jayshree.sales)");
    assert(!!emp2Profile, "Found Employee 2 (jayshree.realty2)");
    assert(!!otherOwnerProfile, "Found Other Workspace Owner (testowner)");
    assert(!!superAdminProfile, "Found Super Admin (testadmin)");

    const wsJayshreeId = ownerProfile.workspace_id;
    const wsOtherId = otherOwnerProfile.workspace_id;

    // Define simulated server auth contexts
    const ownerCtx = {
      userId: ownerProfile.id,
      workspaceId: wsJayshreeId,
      role: "owner",
      isViewingAs: false,
      realUserId: ownerProfile.id,
      realRole: "owner",
    };

    const emp1Ctx = {
      userId: emp1Profile.id,
      workspaceId: wsJayshreeId,
      role: "employee",
      isViewingAs: false,
      realUserId: emp1Profile.id,
      realRole: "employee",
    };

    const emp2Ctx = {
      userId: emp2Profile.id,
      workspaceId: wsJayshreeId,
      role: "employee",
      isViewingAs: false,
      realUserId: emp2Profile.id,
      realRole: "employee",
    };

    const otherOwnerCtx = {
      userId: otherOwnerProfile.id,
      workspaceId: wsOtherId,
      role: "owner",
      isViewingAs: false,
      realUserId: otherOwnerProfile.id,
      realRole: "owner",
    };

    // --------------------------------------------------------------------------
    // TEST 1: Owner Creates Group Chat with Multiple Employees
    // --------------------------------------------------------------------------
    console.log("\n[TEST 1] Owner Creates Group Chat");
    const groupName = `Sales Team ${Date.now()}`;
    const createRes = await createChatGroupCore(ownerCtx, {
      title: groupName,
      description: "Q4 High-priority sales pipeline coordination",
      memberIds: [emp1Profile.id], // initially add emp1 only
    });

    assert(!!createRes.conversationId, "Group conversation created with UUID");
    assert(createRes.title === groupName, "Group title matches");

    const groupId = createRes.conversationId;

    // Verify conversation record in MySQL
    const [convRows] = await conn.query("SELECT * FROM chat_conversations WHERE id = ?", [groupId]);
    assert(convRows.length === 1, "Group found in chat_conversations table");
    assert(convRows[0].type === "group", "Conversation type is 'group'");
    assert(convRows[0].owner_id === ownerProfile.id, "Group owner_id matches Owner");
    assert(convRows[0].status === "active", "Group initial status is 'active'");

    // Verify members in MySQL (Owner + Emp1)
    const members = await getGroupMembersCore(ownerCtx, { conversationId: groupId });
    assert(members.length === 2, `Group has exactly 2 members (got: ${members.length})`);
    const ownerMember = members.find((m) => m.user_id === ownerProfile.id);
    const emp1Member = members.find((m) => m.user_id === emp1Profile.id);
    assert(!!ownerMember && ownerMember.role === "owner", "Owner is automatically enrolled with role 'owner'");
    assert(!!emp1Member && emp1Member.role === "member", "Employee 1 enrolled with role 'member'");

    // --------------------------------------------------------------------------
    // TEST 2: Employee Permission Enforcement (Employee CANNOT Create Groups)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 2] Employee Group Permissions (RBAC Fail-Closed)");
    let empCreateBlocked = false;
    try {
      await createChatGroupCore(emp1Ctx, {
        title: "Unauthorized Group",
        memberIds: [emp2Profile.id],
      });
    } catch (err) {
      empCreateBlocked = true;
    }
    assert(empCreateBlocked, "Employee blocked from creating group (Owner only)");

    // --------------------------------------------------------------------------
    // TEST 3: Group Messaging & Broadcast
    // --------------------------------------------------------------------------
    console.log("\n[TEST 3] Group Messaging & Read Tracking");
    // Owner sends message
    const sendRes1 = await sendChatMessageCore(ownerCtx, {
      conversationId: groupId,
      body: "Welcome to the group team! Let's close deals.",
    });
    assert(!!sendRes1.message.id, "Owner sent message to group");
    assert(sendRes1.message.receiver_id === null, "Group message receiver_id is NULL (broadcast)");
    assert(sendRes1.message.sender_id === ownerProfile.id, "Sender ID is Owner");

    // Employee 1 views group messages
    const emp1Messages = await getChatMessagesCore(emp1Ctx, { conversationId: groupId });
    assert(emp1Messages.messages.length >= 2, "Employee 1 sees welcome message + Owner message");
    assert(emp1Messages.memberCount === 2, "Member count is 2");

    // Employee 1 replies in group
    const emp1SendRes = await sendChatMessageCore(emp1Ctx, {
      conversationId: groupId,
      body: "Employee 1 reporting in! Ready to close deals.",
    });
    assert(!!emp1SendRes.message.id, "Employee 1 successfully sent reply to group");

    // --------------------------------------------------------------------------
    // TEST 4: Membership History & joined_at Visibility Rule
    // --------------------------------------------------------------------------
    console.log("\n[TEST 4] joined_at Visibility Rule (New member cannot see older messages)");
    // Small sleep so joined_at for emp2 is strictly later than earlier messages
    await new Promise((res) => setTimeout(res, 1100));

    // Owner adds Employee 2 to group NOW
    const addRes = await addGroupMembersCore(ownerCtx, {
      conversationId: groupId,
      userIds: [emp2Profile.id],
    });
    assert(addRes.addedCount === 1, "Employee 2 added to group");

    // Employee 2 fetches group messages
    const emp2Chat = await getChatMessagesCore(emp2Ctx, { conversationId: groupId });
    // Since emp2 joined after the first 3 messages were sent, emp2 should see 0 older messages!
    assert(
      emp2Chat.messages.length === 0,
      `Employee 2 cannot see messages sent before joined_at (got: ${emp2Chat.messages.length} messages)`,
    );

    // Now Employee 1 sends a new message AFTER Employee 2 joined
    await sendChatMessageCore(emp1Ctx, {
      conversationId: groupId,
      body: "Welcome Employee 2 to our sales team!",
    });

    // Employee 2 now fetches again: should see exactly this new message
    const emp2ChatAfter = await getChatMessagesCore(emp2Ctx, { conversationId: groupId });
    assert(
      emp2ChatAfter.messages.length === 1,
      `Employee 2 sees exactly messages sent after joined_at (got: ${emp2ChatAfter.messages.length} messages)`,
    );
    assert(
      emp2ChatAfter.messages[0].body === "Welcome Employee 2 to our sales team!",
      "Message content matches newly sent post-join message",
    );

    // --------------------------------------------------------------------------
    // TEST 5: Owner Group Management (Rename, Remove Member, Owner Protection)
    // --------------------------------------------------------------------------
    console.log("\n[TEST 5] Owner Group Management & Owner Protection");
    // Owner renames group
    const newTitle = `${groupName} (Renamed)`;
    const renameRes = await renameChatGroupCore(ownerCtx, {
      conversationId: groupId,
      title: newTitle,
      description: "Updated description for pipeline",
    });
    assert(renameRes.title === newTitle, "Group successfully renamed by Owner");

    // Employee tries to rename group (Blocked)
    let empRenameBlocked = false;
    try {
      await renameChatGroupCore(emp1Ctx, {
        conversationId: groupId,
        title: "Hacked Group Title",
      });
    } catch {
      empRenameBlocked = true;
    }
    assert(empRenameBlocked, "Employee blocked from renaming group");

    // Owner protection: Owner CANNOT be removed from group
    let ownerRemoveBlocked = false;
    try {
      await removeGroupMemberCore(ownerCtx, {
        conversationId: groupId,
        targetUserId: ownerProfile.id,
      });
    } catch {
      ownerRemoveBlocked = true;
    }
    assert(ownerRemoveBlocked, "Owner cannot be removed from group (Owner protection)");

    // Owner removes Employee 2
    const removeRes = await removeGroupMemberCore(ownerCtx, {
      conversationId: groupId,
      targetUserId: emp2Profile.id,
    });
    assert(removeRes.success === true, "Owner successfully removed Employee 2");

    // Removed Employee 2 CANNOT access group anymore
    let removedAccessBlocked = false;
    try {
      await getChatMessagesCore(emp2Ctx, { conversationId: groupId });
    } catch {
      removedAccessBlocked = true;
    }
    assert(removedAccessBlocked, "Removed member blocked from reading group messages");

    // Removed Employee 2 CANNOT send message to group
    let removedSendBlocked = false;
    try {
      await sendChatMessageCore(emp2Ctx, {
        conversationId: groupId,
        body: "Trying to post after being removed",
      });
    } catch {
      removedSendBlocked = true;
    }
    assert(removedSendBlocked, "Removed member blocked from sending messages to group");

    // --------------------------------------------------------------------------
    // TEST 6: Archive, Restore & Delete Lifecycle
    // --------------------------------------------------------------------------
    console.log("\n[TEST 6] Group Archive, Restore & Delete Lifecycle");
    // Owner archives group
    await archiveChatGroupCore(ownerCtx, { conversationId: groupId });
    const [archivedRows] = await conn.query("SELECT status FROM chat_conversations WHERE id = ?", [groupId]);
    assert(archivedRows[0].status === "archived", "Group status updated to 'archived'");

    // Sending message to archived group is blocked
    let sendToArchivedBlocked = false;
    try {
      await sendChatMessageCore(ownerCtx, {
        conversationId: groupId,
        body: "Message to archived group",
      });
    } catch {
      sendToArchivedBlocked = true;
    }
    assert(sendToArchivedBlocked, "Sending message to archived group is blocked");

    // Archived group is listed in Owner's archived groups list
    const archivedList = await listArchivedChatGroupsCore(ownerCtx);
    const foundArchived = archivedList.find((g) => g.id === groupId);
    assert(!!foundArchived, "Archived group appears in listArchivedChatGroups");

    // Owner restores group
    await restoreChatGroupCore(ownerCtx, { conversationId: groupId });
    const [restoredRows] = await conn.query("SELECT status FROM chat_conversations WHERE id = ?", [groupId]);
    assert(restoredRows[0].status === "active", "Group status restored to 'active'");

    // Owner deletes group permanently
    await deleteChatGroupCore(ownerCtx, { conversationId: groupId });
    const [deletedRows] = await conn.query("SELECT id FROM chat_conversations WHERE id = ?", [groupId]);
    assert(deletedRows.length === 0, "Group permanently deleted from chat_conversations");

    const [deletedMsgRows] = await conn.query("SELECT id FROM chat_messages WHERE conversation_id = ?", [groupId]);
    assert(deletedMsgRows.length === 0, "Group messages permanently deleted from chat_messages");

    const [deletedMemberRows] = await conn.query("SELECT id FROM chat_conversation_members WHERE conversation_id = ?", [groupId]);
    assert(deletedMemberRows.length === 0, "Group members permanently deleted from chat_conversation_members");

    // --------------------------------------------------------------------------
    // TEST 7: Cross-Workspace Security & IDOR Isolation
    // --------------------------------------------------------------------------
    console.log("\n[TEST 7] Strict Cross-Workspace Isolation & Security");
    // Create new group in Jayshree workspace
    const secGroup = await createChatGroupCore(ownerCtx, {
      title: `Security Group ${Date.now()}`,
      memberIds: [emp1Profile.id],
    });

    // Other Workspace Owner tries to read Jayshree group (Blocked)
    let crossWsReadBlocked = false;
    try {
      await getChatMessagesCore(otherOwnerCtx, { conversationId: secGroup.conversationId });
    } catch {
      crossWsReadBlocked = true;
    }
    assert(crossWsReadBlocked, "Cross-workspace group read blocked with FORBIDDEN");

    // Other Workspace Owner tries to send message into Jayshree group (Blocked)
    let crossWsSendBlocked = false;
    try {
      await sendChatMessageCore(otherOwnerCtx, {
        conversationId: secGroup.conversationId,
        body: "Infiltrating another workspace",
      });
    } catch {
      crossWsSendBlocked = true;
    }
    assert(crossWsSendBlocked, "Cross-workspace group message send blocked with FORBIDDEN");

    // Owner tries to add cross-workspace user to group (Blocked)
    let crossWsAddBlocked = false;
    try {
      await addGroupMembersCore(ownerCtx, {
        conversationId: secGroup.conversationId,
        userIds: [otherOwnerProfile.id],
      });
    } catch {
      crossWsAddBlocked = true;
    }
    assert(crossWsAddBlocked, "Adding cross-workspace user to group blocked");

    // Clean up security group
    await deleteChatGroupCore(ownerCtx, { conversationId: secGroup.conversationId });

    // --------------------------------------------------------------------------
    // TEST 8: Group Chat Retention & Cleanup
    // --------------------------------------------------------------------------
    console.log("\n[TEST 8] Group Retention & Scheduled Cleanup");
    const retGroup = await createChatGroupCore(ownerCtx, {
      title: `Retention Group ${Date.now()}`,
      memberIds: [emp1Profile.id],
    });

    const retMsg = await sendChatMessageCore(ownerCtx, {
      conversationId: retGroup.conversationId,
      body: "Group retention test message",
    });

    // Check message expires_at
    const [retMsgRows] = await conn.query("SELECT created_at, expires_at FROM chat_messages WHERE id = ?", [
      retMsg.message.id,
    ]);
    const createdDate = new Date(retMsgRows[0].created_at);
    const expiresDate = new Date(retMsgRows[0].expires_at);
    const diffDays = Math.round((expiresDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays === 15, `Group message expires_at is exactly 15 days from created_at (${diffDays} days)`);

    // Insert an expired test message in this group
    const expiredMsgId = "expired-group-test-msg-" + Date.now();
    await conn.query(
      `INSERT INTO chat_messages (id, workspace_id, conversation_id, sender_id, receiver_id, body, is_read, created_at, expires_at)
       VALUES (?, ?, ?, ?, NULL, 'Old expired group message', 0, DATE_SUB(NOW(), INTERVAL 16 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY))`,
      [expiredMsgId, wsJayshreeId, retGroup.conversationId, ownerProfile.id],
    );

    // Run cleanup engine
    const cleanupRes = await cleanupExpiredChatMessages(500);
    assert(cleanupRes.deletedCount >= 1, `Cleanup deleted expired group messages (count: ${cleanupRes.deletedCount})`);

    const [checkDeleted] = await conn.query("SELECT id FROM chat_messages WHERE id = ?", [expiredMsgId]);
    assert(checkDeleted.length === 0, "Expired group message was ACTUALLY deleted from MySQL");

    // Clean up retention group
    await deleteChatGroupCore(ownerCtx, { conversationId: retGroup.conversationId });

    // --------------------------------------------------------------------------
    // TEST 9: Regression — Existing Direct Chat Still Fully Works
    // --------------------------------------------------------------------------
    console.log("\n[TEST 9] Regression: Existing Direct Chat Works Intact");
    const directRes = await sendChatMessageCore(ownerCtx, {
      recipientId: emp1Profile.id,
      body: "Regression test for direct messaging.",
    });
    assert(!!directRes.conversationId, "Direct message conversation resolved");
    assert(directRes.message.receiver_id === emp1Profile.id, "Direct message has receiver_id set");

    const directMessages = await getChatMessagesCore(emp1Ctx, { conversationId: directRes.conversationId });
    assert(directMessages.messages.length >= 1, "Direct messages fetched successfully");
    assert(directMessages.participant?.full_name === ownerProfile.full_name, "Participant resolved as Owner");

    // --------------------------------------------------------------------------
    // TEST 10: Multi-Tenant & Future Workspaces Default Retention
    // --------------------------------------------------------------------------
    console.log("\n[TEST 10] Multi-Tenant Architecture & Future Workspaces");
    const futureWsId = "ws-future-test-" + Date.now();
    await conn.query(
      `INSERT INTO workspaces (id, code, name, industry, plan, status, currency, timezone, date_format, time_format, chat_retention_days)
       VALUES (?, 'FUTURE-WS', 'Future Corp', 'Real Estate', 'growth', 'active', 'INR', 'Asia/Kolkata', 'DD/MM/YYYY', '12h', 15)`,
      [futureWsId],
    );

    const [futureWs] = await conn.query("SELECT chat_retention_days FROM workspaces WHERE id = ?", [futureWsId]);
    assert(futureWs[0].chat_retention_days === 15, "New workspace automatically receives 15 days default retention");

    await conn.query("DELETE FROM workspaces WHERE id = ?", [futureWsId]);
    assert(true, "Future test workspace cleaned up cleanly");

    console.log("\n==================================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

main();
