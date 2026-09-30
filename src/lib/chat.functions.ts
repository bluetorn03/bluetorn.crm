/**
 * BLUETORN CRM — TEAM CHAT V1 SERVER FUNCTIONS
 *
 * Strict Server-Side Workspace Isolation & RBAC.
 * - Authenticates current session via requireMySqlAuth middleware
 * - Resolves current workspace server-side (never trusts client workspaceId/userId)
 * - Fails closed on unauthorized / cross-workspace conversation access
 * - Audits security violations to audit_logs
 * - Text-only V1, retention calculated server-side (created_at + workspace_retention_days)
 * - Deactivated users blocked from sending
 * - Read-only view-as preview mode enforced
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertNotViewingAs } from "./auth-server.ts";
import { query, queryOne, execute, transaction, uuid } from "./db.ts";
import { applyRetentionReduction } from "./chat-cleanup.ts";
import type {
  ChatConversation,
  ChatMessage,
  ChatConversationSummary,
  ChatParticipant,
  Profile,
  UserRole,
} from "./db-types.ts";

/* --------------------------------- types ---------------------------------- */

export interface ServerAuthContext {
  userId: string;
  workspaceId: string | null;
  role: string;
  isViewingAs?: boolean | undefined;
  realUserId?: string | undefined;
  realRole?: string | undefined;
}

/* --------------------------------- helpers -------------------------------- */

/** Allowed retention values configured only by Super Admin */
export const ALLOWED_RETENTION_DAYS = [3, 7, 10, 15] as const;
export const DEFAULT_RETENTION_DAYS = 15;
export const MAX_RETENTION_DAYS = 15;

async function logSecurityAlert(
  workspaceId: string | null,
  actorId: string,
  actorRole: unknown,
  action: string,
  details: Record<string, any>,
) {
  try {
    const roleLabel = typeof actorRole === "string" ? actorRole : "unknown";
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        workspaceId,
        actorId,
        roleLabel,
        action,
        "chat_security",
        details["targetId"] || null,
        JSON.stringify(details),
      ],
    );
  } catch (err) {
    console.error("[Chat Security Audit] Failed to write audit log:", err);
  }
}

/** Check if current user is active in workspace */
async function assertActiveSender(userId: string, workspaceId: string): Promise<Profile> {
  const profile = await queryOne<Profile>(
    "SELECT id, workspace_id, user_code, full_name, is_active FROM profiles WHERE id = ? AND workspace_id = ? LIMIT 1",
    [userId, workspaceId],
  );

  if (!profile || !profile.is_active) {
    throw new Error("FORBIDDEN: Your account is deactivated and cannot send messages.");
  }

  return profile;
}

/** Fetch workspace retention days (default 15, maximum 15) */
export async function getWorkspaceRetentionDays(workspaceId: string): Promise<number> {
  const ws = await queryOne<{ chat_retention_days: number | null }>(
    "SELECT chat_retention_days FROM workspaces WHERE id = ? LIMIT 1",
    [workspaceId],
  );

  const days = ws?.chat_retention_days ?? DEFAULT_RETENTION_DAYS;
  if (!days || days <= 0 || days > MAX_RETENTION_DAYS) {
    return DEFAULT_RETENTION_DAYS;
  }
  return days;
}

/* -------------------------------- queries --------------------------------- */

/**
 * List all 1:1 conversations for the current authenticated user in their current workspace.
 * Orders by last_message_at DESC.
 */
export async function listChatConversationsCore(
  context: ServerAuthContext,
): Promise<ChatConversationSummary[]> {
  const { userId, workspaceId } = context;
  if (!workspaceId) {
    throw new Error("Unauthorized: No active workspace associated with session.");
  }

  // 1. Fetch conversations in current workspace where user is participant
  const conversations = await query<ChatConversation>(
    `SELECT id, workspace_id, user1_id, user2_id, last_message_at, created_at, updated_at
     FROM chat_conversations
     WHERE workspace_id = ? AND (user1_id = ? OR user2_id = ?)
     ORDER BY COALESCE(last_message_at, updated_at) DESC`,
    [workspaceId, userId, userId],
  );

  if (conversations.length === 0) {
    return [];
  }

  // 2. Resolve other participant IDs
  const otherUserIds = Array.from(
    new Set(conversations.map((c) => (c.user1_id === userId ? c.user2_id : c.user1_id))),
  );

  const placeholders = otherUserIds.map(() => "?").join(", ");
  const profiles = await query<Profile & { role: string | null }>(
    `SELECT p.id, p.user_code, p.full_name, p.job_title, p.avatar_url, p.is_active, r.role
     FROM profiles p
     LEFT JOIN user_roles r ON p.id = r.user_id AND (r.workspace_id = ? OR r.workspace_id IS NULL)
     WHERE p.id IN (${placeholders})`,
    [workspaceId, ...otherUserIds],
  );

  const profileMap = new Map<string, ChatParticipant>(
    profiles.map((p) => [
      p.id,
      {
        id: p.id,
        user_code: p.user_code,
        full_name: p.full_name,
        job_title: p.job_title,
        avatar_url: p.avatar_url,
        is_active: Boolean(p.is_active),
        role: p.role,
      },
    ]),
  );

  // 3. For each conversation, fetch last message and unread count
  const convSummaries = await Promise.all(
    conversations.map(async (conv) => {
      const otherId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
      const participant = profileMap.get(otherId) ?? {
        id: otherId,
        user_code: "unknown",
        full_name: "Team Member",
        job_title: null,
        avatar_url: null,
        is_active: false,
        role: null,
      };

      // Last valid non-expired message
      const lastMsg = await queryOne<ChatMessage>(
        `SELECT id, body, sender_id, created_at, is_read
         FROM chat_messages
         WHERE conversation_id = ? AND workspace_id = ? AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [conv.id, workspaceId],
      );

      // Unread count for current user
      const unreadRow = await queryOne<{ unread_count: number }>(
        `SELECT COUNT(*) as unread_count
         FROM chat_messages
         WHERE conversation_id = ? AND workspace_id = ? AND receiver_id = ? AND is_read = 0 AND expires_at > NOW()`,
        [conv.id, workspaceId, userId],
      );

      return {
        id: conv.id,
        workspace_id: conv.workspace_id,
        participant,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              body: lastMsg.body,
              sender_id: lastMsg.sender_id,
              created_at: lastMsg.created_at,
              is_read: Boolean(lastMsg.is_read),
            }
          : null,
        unreadCount: Number(unreadRow?.unread_count ?? 0),
        updated_at: conv.updated_at,
      };
    }),
  );

  return convSummaries;
}

export const listChatConversationsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<ChatConversationSummary[]> => {
    return listChatConversationsCore(context as unknown as ServerAuthContext);
  });

/**
 * Get all active messages for a single conversation.
 * Verifies server-side authorization:
 * - Session must belong to conversation's workspace
 * - Current user must be a participant (user1 or user2)
 * Marks unread messages for the viewer as read automatically.
 */
export async function getChatMessagesCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{
  conversation: ChatConversation;
  participant: ChatParticipant;
  messages: ChatMessage[];
  retentionDays: number;
}> {
  const { userId, workspaceId, role } = context;
  if (!workspaceId) {
    throw new Error("Unauthorized: No active workspace associated with session.");
  }

  // 1. Fetch conversation
  const conv = await queryOne<ChatConversation>(
    "SELECT * FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv) {
    throw new Error("Conversation not found.");
  }

  // 2. Strict Workspace Isolation & Participant Authorization
  if (conv.workspace_id !== workspaceId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.cross_workspace_denied", {
      attemptedConversationId: data.conversationId,
      targetWorkspaceId: conv.workspace_id,
    });
    throw new Error("FORBIDDEN: Unauthorized conversation access.");
  }

  if (conv.user1_id !== userId && conv.user2_id !== userId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.unauthorized_participant_denied", {
      attemptedConversationId: data.conversationId,
    });
    throw new Error("FORBIDDEN: You are not a participant in this conversation.");
  }

  // 3. Mark unread messages directed to current user as read
  await execute(
    `UPDATE chat_messages
     SET is_read = 1, read_at = NOW()
     WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0 AND expires_at > NOW()`,
    [data.conversationId, userId],
  );

  // 4. Fetch non-expired messages in chronological order
  const messages = await query<ChatMessage>(
    `SELECT id, workspace_id, conversation_id, sender_id, receiver_id, body, is_read, read_at, created_at, expires_at
     FROM chat_messages
     WHERE conversation_id = ? AND workspace_id = ? AND expires_at > NOW()
     ORDER BY created_at ASC`,
    [data.conversationId, workspaceId],
  );

  // 5. Fetch participant details
  const otherId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
  const partRow = await queryOne<Profile & { role: string | null }>(
    `SELECT p.id, p.user_code, p.full_name, p.job_title, p.avatar_url, p.is_active, r.role
     FROM profiles p
     LEFT JOIN user_roles r ON p.id = r.user_id AND (r.workspace_id = ? OR r.workspace_id IS NULL)
     WHERE p.id = ? LIMIT 1`,
    [workspaceId, otherId],
  );

  const participant: ChatParticipant = {
    id: otherId,
    user_code: partRow?.user_code ?? "user",
    full_name: partRow?.full_name ?? "Team Member",
    job_title: partRow?.job_title ?? null,
    avatar_url: partRow?.avatar_url ?? null,
    is_active: Boolean(partRow?.is_active ?? true),
    role: partRow?.role ?? null,
  };

  const retentionDays = await getWorkspaceRetentionDays(workspaceId);

  return {
    conversation: conv,
    participant,
    messages,
    retentionDays,
  };
}

export const getChatMessagesFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId?.trim()) {
      throw new Error("Conversation ID is required.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    return getChatMessagesCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Total unread message count for the current user in the current workspace.
 * Powers the navigation badge.
 */
export async function getChatUnreadCountCore(
  context: ServerAuthContext,
): Promise<{ unreadCount: number }> {
  const { userId, workspaceId } = context;
  if (!workspaceId) return { unreadCount: 0 };

  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM chat_messages
     WHERE workspace_id = ? AND receiver_id = ? AND is_read = 0 AND expires_at > NOW()`,
    [workspaceId, userId],
  );

  return { unreadCount: Number(row?.count ?? 0) };
}

export const getChatUnreadCountFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<{ unreadCount: number }> => {
    return getChatUnreadCountCore(context as unknown as ServerAuthContext);
  });

/**
 * List other active members of the workspace available to start a 1:1 chat with.
 */
export async function listAvailableChatUsersCore(
  context: ServerAuthContext,
): Promise<ChatParticipant[]> {
  const { userId, workspaceId } = context;
  if (!workspaceId) return [];

  const members = await query<Profile & { role: string | null }>(
    `SELECT p.id, p.user_code, p.full_name, p.job_title, p.avatar_url, p.is_active, r.role
     FROM profiles p
     LEFT JOIN user_roles r ON p.id = r.user_id AND (r.workspace_id = ? OR r.workspace_id IS NULL)
     WHERE p.workspace_id = ? AND p.id != ? AND p.is_active = 1
     ORDER BY p.full_name ASC`,
    [workspaceId, workspaceId, userId],
  );

  return members.map((m) => ({
    id: m.id,
    user_code: m.user_code,
    full_name: m.full_name,
    job_title: m.job_title,
    avatar_url: m.avatar_url,
    is_active: Boolean(m.is_active),
    role: m.role,
  }));
}

export const listAvailableChatUsersFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<ChatParticipant[]> => {
    return listAvailableChatUsersCore(context as unknown as ServerAuthContext);
  });

/* -------------------------------- mutations ------------------------------- */

/**
 * Send a message in a 1:1 conversation.
 * Either `conversationId` or `recipientId` must be provided.
 *
 * Security:
 * - Read-only view-as preview blocked
 * - Sender must be active profile in current workspace
 * - Recipient must be active profile in current workspace
 * - Sender cannot impersonate another user
 * - Target conversation must belong to current workspace
 * - Calculates expires_at = NOW() + workspace_retention_days (max 15)
 */
export async function sendChatMessageCore(
  context: ServerAuthContext,
  data: {
    conversationId?: string | undefined;
    recipientId?: string | undefined;
    body: string;
  },
): Promise<{ message: ChatMessage; conversationId: string }> {
  // 1. Preview mode check
  if (context.isViewingAs) {
    throw new Error("Action not permitted in view-as preview mode. Switch back to your account to perform this action.");
  }

  const { userId, workspaceId, role } = context;
  if (!workspaceId) {
    throw new Error("Unauthorized: No active workspace associated with session.");
  }

  // 2. Sender must be active in current workspace
  await assertActiveSender(userId, workspaceId);

  let convId = data.conversationId;
  let targetRecipientId = data.recipientId;

  if (convId) {
    // Validate existing conversation
    const conv = await queryOne<ChatConversation>(
      "SELECT * FROM chat_conversations WHERE id = ? LIMIT 1",
      [convId],
    );

    if (!conv) {
      throw new Error("Conversation not found.");
    }

    if (conv.workspace_id !== workspaceId) {
      await logSecurityAlert(workspaceId, userId, role, "chat.cross_workspace_send_denied", {
        targetConversationId: convId,
      });
      throw new Error("FORBIDDEN: Unauthorized conversation access.");
    }

    if (conv.user1_id !== userId && conv.user2_id !== userId) {
      await logSecurityAlert(workspaceId, userId, role, "chat.unauthorized_send_denied", {
        targetConversationId: convId,
      });
      throw new Error("FORBIDDEN: You are not a participant in this conversation.");
    }

    targetRecipientId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
  } else if (targetRecipientId) {
    // Starting or resolving conversation by recipient
    if (targetRecipientId === userId) {
      throw new Error("Cannot start conversation with yourself.");
    }

    // Check recipient is active member of same workspace
    const recipient = await queryOne<Profile>(
      "SELECT id, workspace_id, is_active FROM profiles WHERE id = ? AND workspace_id = ? LIMIT 1",
      [targetRecipientId, workspaceId],
    );

    if (!recipient) {
      throw new Error("Recipient user does not exist in this workspace.");
    }

    if (!recipient.is_active) {
      throw new Error("Cannot send message to a deactivated user.");
    }

    // Normalize user pair: user1_id < user2_id to guarantee unique conversation pair
    const [u1, u2] = userId < targetRecipientId ? [userId, targetRecipientId] : [targetRecipientId, userId];

    // Find or create conversation atomically
    const existingConv = await queryOne<ChatConversation>(
      "SELECT * FROM chat_conversations WHERE workspace_id = ? AND user1_id = ? AND user2_id = ? LIMIT 1",
      [workspaceId, u1, u2],
    );

    if (existingConv) {
      convId = existingConv.id;
    } else {
      convId = uuid();
      await execute(
        `INSERT INTO chat_conversations (id, workspace_id, user1_id, user2_id, last_message_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [convId, workspaceId, u1, u2],
      );
    }
  } else {
    throw new Error("Either conversationId or recipientId must be provided.");
  }

  if (!targetRecipientId || !convId) {
    throw new Error("Unable to resolve chat conversation.");
  }

  // 3. Verify recipient is currently active
  const recipientCheck = await queryOne<Profile>(
    "SELECT id, is_active FROM profiles WHERE id = ? AND workspace_id = ? LIMIT 1",
    [targetRecipientId, workspaceId],
  );

  if (!recipientCheck?.is_active) {
    throw new Error("Cannot send message to a deactivated user.");
  }

  // 4. Calculate retention expiration: expires_at = NOW() + workspace_retention_days
  const retentionDays = await getWorkspaceRetentionDays(workspaceId);
  const messageId = uuid();

  // 5. Insert message and update conversation's last_message_at
  await execute(
    `INSERT INTO chat_messages (id, workspace_id, conversation_id, sender_id, receiver_id, body, is_read, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [messageId, workspaceId, convId, userId, targetRecipientId, data.body, retentionDays],
  );

  await execute(
    "UPDATE chat_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?",
    [convId],
  );

  const insertedMsg = await queryOne<ChatMessage>(
    "SELECT * FROM chat_messages WHERE id = ? LIMIT 1",
    [messageId],
  );

  return {
    message: insertedMsg!,
    conversationId: convId,
  };
}

export const sendChatMessageFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      conversationId?: string | undefined;
      recipientId?: string | undefined;
      body: string;
    }) => {
      const trimmed = input?.body?.trim();
      if (!trimmed) {
        throw new Error("Message cannot be empty.");
      }
      if (trimmed.length > 5000) {
        throw new Error("Message exceeds 5,000 character limit.");
      }
      return {
        conversationId: input.conversationId?.trim() || undefined,
        recipientId: input.recipientId?.trim() || undefined,
        body: trimmed,
      };
    },
  )
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Sending chat messages");
    return sendChatMessageCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Mark all messages in a conversation as read for the current viewer.
 */
export async function markConversationReadCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{ success: boolean }> {
  const { userId, workspaceId } = context;
  if (!workspaceId) return { success: false };

  // Verify conversation
  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, user1_id, user2_id FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId) return { success: false };
  if (conv.user1_id !== userId && conv.user2_id !== userId) return { success: false };

  await execute(
    `UPDATE chat_messages
     SET is_read = 1, read_at = NOW()
     WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0`,
    [data.conversationId, userId],
  );

  return { success: true };
}

export const markConversationReadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    return markConversationReadCore(context as unknown as ServerAuthContext, data);
  });

/* --------------------------- retention policy ----------------------------- */

/**
 * Get the current workspace retention policy.
 * Readable by all authenticated workspace members (Owner/Employee/Super Admin).
 */
export async function getWorkspaceRetentionPolicyCore(
  context: ServerAuthContext,
  data?: { workspaceId?: string | undefined },
): Promise<{
  retentionDays: number;
  maxAllowed: number;
  allowedValues: number[];
}> {
  const targetWsId =
    context.role === "super_admin" && data?.workspaceId ? data.workspaceId : context.workspaceId;

  if (!targetWsId) {
    throw new Error("No workspace specified.");
  }

  const days = await getWorkspaceRetentionDays(targetWsId);

  return {
    retentionDays: days,
    maxAllowed: MAX_RETENTION_DAYS,
    allowedValues: [...ALLOWED_RETENTION_DAYS],
  };
}

export const getWorkspaceRetentionPolicyFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input?: { workspaceId?: string | undefined }) => input ?? {})
  .handler(async ({ data, context }) => {
    return getWorkspaceRetentionPolicyCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Update the retention policy for a workspace.
 * Strictly Super Admin only.
 * Allowed values: strictly [3, 7, 10, 15].
 * When retention is reduced:
 * - Messages older than new policy immediately become eligible for deletion
 * - Deletes now-expired messages from MySQL
 * - Logs audit record to audit_logs
 */
export async function updateWorkspaceRetentionPolicyCore(
  context: ServerAuthContext,
  data: { workspaceId: string; retentionDays: number },
): Promise<{
  success: boolean;
  retentionDays: number;
  updatedMessages: number;
  deletedExpired: number;
}> {
  // 1. Strictly Super Admin only
  if (context.role !== "super_admin") {
    await logSecurityAlert(
      data.workspaceId,
      context.userId,
      context.role,
      "chat.retention_change_unauthorized",
      { attemptedDays: data.retentionDays },
    );
    throw new Error("FORBIDDEN: Only Super Admin is permitted to configure retention policy.");
  }

  const days = Number(data.retentionDays);
  if (!ALLOWED_RETENTION_DAYS.includes(days as any)) {
    throw new Error("Invalid retention policy. Allowed values: 3, 7, 10, or 15 days.");
  }

  // 2. Fetch workspace and previous retention
  const prevRetention = await getWorkspaceRetentionDays(data.workspaceId);

  // 3. Update workspace chat_retention_days
  await execute("UPDATE workspaces SET chat_retention_days = ? WHERE id = ?", [
    data.retentionDays,
    data.workspaceId,
  ]);

  let updatedMessages = 0;
  let deletedExpired = 0;

  // 4. When retention is reduced: update older messages & delete expired records
  if (data.retentionDays < prevRetention) {
    const cleanupRes = await applyRetentionReduction(data.workspaceId, data.retentionDays);
    updatedMessages = cleanupRes.updatedMessages;
    deletedExpired = cleanupRes.deletedExpired;
  }

  // 5. Log audit event
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      data.workspaceId,
      context.userId,
      "Super Admin",
      "chat.retention_updated",
      "workspace",
      data.workspaceId,
      JSON.stringify({
        previousRetentionDays: prevRetention,
        newRetentionDays: data.retentionDays,
        updatedMessages,
        deletedExpired,
      }),
    ],
  );

  return {
    success: true,
    retentionDays: data.retentionDays,
    updatedMessages,
    deletedExpired,
  };
}

export const updateWorkspaceRetentionPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; retentionDays: number }) => {
    if (!input?.workspaceId?.trim()) {
      throw new Error("Workspace ID is required.");
    }
    const days = Number(input.retentionDays);
    if (!ALLOWED_RETENTION_DAYS.includes(days as any)) {
      throw new Error("Invalid retention policy. Allowed values: 3, 7, 10, or 15 days.");
    }
    return {
      workspaceId: input.workspaceId.trim(),
      retentionDays: days,
    };
  })
  .handler(async ({ data, context }) => {
    return updateWorkspaceRetentionPolicyCore(context as unknown as ServerAuthContext, data);
  });
