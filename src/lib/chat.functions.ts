/**
 * BLUETORN CRM — TEAM CHAT & GROUPS SERVER FUNCTIONS
 *
 * Strict Server-Side Workspace Isolation & RBAC.
 * - Authenticates current session via requireMySqlAuth middleware
 * - Resolves current workspace server-side (never trusts client workspaceId/userId)
 * - Fails closed on unauthorized / cross-workspace conversation/group access
 * - Audits security & group administration violations to audit_logs
 * - 1:1 Direct Chat and Owner-Created Group Chat supported seamlessly
 * - Newly added group members only see messages from `joined_at` onwards
 * - Deactivated users blocked from sending
 * - Read-only view-as preview mode enforced
 * - 15-day maximum server-side retention enforced uniformly
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertNotViewingAs } from "./auth-server.ts";
import { query, queryOne, execute, transaction, uuid } from "./db.ts";
import { applyRetentionReduction } from "./chat-cleanup.ts";
import type {
  ChatConversation,
  ChatConversationMember,
  ChatMessage,
  ChatConversationSummary,
  ChatParticipant,
  Profile,
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

export async function logSecurityAlert(
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
 * List all conversations (Direct + Active Groups) for the authenticated user in their current workspace.
 * Orders by COALESCE(last_message_at, updated_at) DESC.
 */
export async function listChatConversationsCore(
  context: ServerAuthContext,
): Promise<ChatConversationSummary[]> {
  const { userId, workspaceId } = context;
  if (!workspaceId) {
    throw new Error("Unauthorized: No active workspace associated with session.");
  }

  // 1. Fetch direct conversations where user is participant
  const directConvs = await query<ChatConversation>(
    `SELECT id, workspace_id, type, title, description, owner_id, status, user1_id, user2_id, last_message_at, created_at, updated_at
     FROM chat_conversations
     WHERE workspace_id = ? AND (type = 'direct' OR type IS NULL) AND (user1_id = ? OR user2_id = ?)
     ORDER BY COALESCE(last_message_at, updated_at) DESC`,
    [workspaceId, userId, userId],
  );

  // 2. Fetch active group conversations where user is an active member
  const groupConvs = await query<
    ChatConversation & { member_joined_at: string; member_last_read_at: string | null }
  >(
    `SELECT c.id, c.workspace_id, c.type, c.title, c.description, c.owner_id, c.status,
            c.last_message_at, c.created_at, c.updated_at,
            cm.joined_at as member_joined_at, cm.last_read_at as member_last_read_at
     FROM chat_conversations c
     JOIN chat_conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ? AND cm.status = 'active'
     WHERE c.workspace_id = ? AND c.type = 'group' AND c.status = 'active'
     ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC`,
    [userId, workspaceId],
  );

  // 3. Process direct conversations
  let directSummaries: ChatConversationSummary[] = [];
  if (directConvs.length > 0) {
    const otherUserIds = Array.from(
      new Set(directConvs.map((c) => (c.user1_id === userId ? c.user2_id : c.user1_id)).filter(Boolean)),
    ) as string[];

    const placeholders = otherUserIds.map(() => "?").join(", ");
    const profiles = otherUserIds.length > 0
      ? await query<Profile & { role: string | null }>(
          `SELECT p.id, p.user_code, p.full_name, p.job_title, p.avatar_url, p.is_active, r.role
           FROM profiles p
           LEFT JOIN user_roles r ON p.id = r.user_id AND (r.workspace_id = ? OR r.workspace_id IS NULL)
           WHERE p.id IN (${placeholders})`,
          [workspaceId, ...otherUserIds],
        )
      : [];

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

    directSummaries = await Promise.all(
      directConvs.map(async (conv) => {
        const otherId = (conv.user1_id === userId ? conv.user2_id : conv.user1_id) ?? "";
        const participant = profileMap.get(otherId) ?? {
          id: otherId,
          user_code: "unknown",
          full_name: "Team Member",
          job_title: null,
          avatar_url: null,
          is_active: false,
          role: null,
        };

        const lastMsg = await queryOne<ChatMessage>(
          `SELECT id, body, sender_id, created_at, is_read
           FROM chat_messages
           WHERE conversation_id = ? AND workspace_id = ? AND expires_at > NOW()
           ORDER BY created_at DESC
           LIMIT 1`,
          [conv.id, workspaceId],
        );

        const unreadRow = await queryOne<{ unread_count: number }>(
          `SELECT COUNT(*) as unread_count
           FROM chat_messages
           WHERE conversation_id = ? AND workspace_id = ? AND receiver_id = ? AND is_read = 0 AND expires_at > NOW()`,
          [conv.id, workspaceId, userId],
        );

        return {
          id: conv.id,
          workspace_id: conv.workspace_id,
          type: "direct",
          title: participant.full_name,
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
  }

  // 4. Process group conversations
  const groupSummaries: ChatConversationSummary[] = await Promise.all(
    groupConvs.map(async (conv) => {
      // Member count
      const countRow = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM chat_conversation_members WHERE conversation_id = ? AND status = 'active'`,
        [conv.id],
      );

      // Last message (only visible if sent at or after user joined)
      const lastMsg = await queryOne<ChatMessage & { sender_name: string | null }>(
        `SELECT m.id, m.body, m.sender_id, m.created_at, m.is_read, p.full_name as sender_name
         FROM chat_messages m
         LEFT JOIN profiles p ON m.sender_id = p.id
         WHERE m.conversation_id = ? AND m.workspace_id = ? AND m.expires_at > NOW() AND m.created_at >= ?
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [conv.id, workspaceId, conv.member_joined_at],
      );

      // Unread count: messages sent by others after member's last read timestamp and after member joined
      const unreadRow = await queryOne<{ unread_count: number }>(
        `SELECT COUNT(*) as unread_count
         FROM chat_messages
         WHERE conversation_id = ? AND workspace_id = ? AND sender_id != ?
           AND created_at >= ?
           AND created_at > COALESCE(?, ?)
           AND expires_at > NOW()`,
        [
          conv.id,
          workspaceId,
          userId,
          conv.member_joined_at,
          conv.member_last_read_at,
          conv.member_joined_at,
        ],
      );

      return {
        id: conv.id,
        workspace_id: conv.workspace_id,
        type: "group",
        title: conv.title ?? "Group Chat",
        description: conv.description,
        owner_id: conv.owner_id,
        status: (conv.status as any) ?? "active",
        memberCount: Number(countRow?.count ?? 0),
        participant: null,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              body: lastMsg.body,
              sender_id: lastMsg.sender_id,
              sender_name: lastMsg.sender_name ?? null,
              created_at: lastMsg.created_at,
              is_read: true,
            }
          : null,
        unreadCount: Number(unreadRow?.unread_count ?? 0),
        updated_at: conv.updated_at,
      };
    }),
  );

  // Combine and sort by updated_at / last_message_at DESC
  const all = [...directSummaries, ...groupSummaries];
  all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return all;
}

export const listChatConversationsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<ChatConversationSummary[]> => {
    return listChatConversationsCore(context as unknown as ServerAuthContext);
  });

/**
 * Get all active messages for a single conversation (Direct or Group).
 * Enforces server-side authorization:
 * - Direct: user must be participant (user1 or user2)
 * - Group: user must be an active member of the group
 * - Newly added group members only see messages from their `joined_at` timestamp onward!
 */
export async function getChatMessagesCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{
  conversation: ChatConversation;
  participant: ChatParticipant | null;
  messages: ChatMessage[];
  retentionDays: number;
  memberCount?: number;
  isOwner?: boolean;
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

  // 2. Strict Workspace Isolation
  if (conv.workspace_id !== workspaceId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.cross_workspace_denied", {
      attemptedConversationId: data.conversationId,
      targetWorkspaceId: conv.workspace_id,
    });
    throw new Error("FORBIDDEN: Unauthorized conversation access.");
  }

  const isGroup = conv.type === "group";
  const retentionDays = await getWorkspaceRetentionDays(workspaceId);

  // 3. Authorization & message fetching based on conversation type
  if (isGroup) {
    // Check user is active member in chat_conversation_members
    const member = await queryOne<ChatConversationMember>(
      "SELECT * FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
      [data.conversationId, userId],
    );

    if (!member) {
      await logSecurityAlert(workspaceId, userId, role, "chat.unauthorized_group_access_denied", {
        attemptedConversationId: data.conversationId,
      });
      throw new Error("FORBIDDEN: You are not an active member of this group.");
    }

    // Mark group messages read by updating member's last_read_at
    await execute(
      "UPDATE chat_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?",
      [data.conversationId, userId],
    );

    // Fetch messages from joined_at timestamp onward
    type RawGroupMessageRow = Omit<ChatMessage, "sender_is_active"> & {
      sender_name?: string | null | undefined;
      sender_code?: string | null | undefined;
      sender_avatar?: string | null | undefined;
      sender_is_active?: number | boolean | null | undefined;
    };
    const messages = await query<RawGroupMessageRow>(
      `SELECT m.id, m.workspace_id, m.conversation_id, m.sender_id, m.receiver_id, m.body,
              m.is_read, m.read_at, m.created_at, m.expires_at,
              p.full_name as sender_name, p.user_code as sender_code, p.avatar_url as sender_avatar, p.is_active as sender_is_active
       FROM chat_messages m
       LEFT JOIN profiles p ON m.sender_id = p.id
       WHERE m.conversation_id = ? AND m.workspace_id = ? AND m.expires_at > NOW() AND m.created_at >= ?
       ORDER BY m.created_at ASC`,
      [data.conversationId, workspaceId, member.joined_at],
    );

    // Get active member count
    const countRow = await queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM chat_conversation_members WHERE conversation_id = ? AND status = 'active'",
      [data.conversationId],
    );

    return {
      conversation: conv,
      participant: null,
      messages: messages.map((m) => ({
        ...m,
        sender_is_active: Boolean(m.sender_is_active ?? true),
      })),
      retentionDays,
      memberCount: Number(countRow?.count ?? 0),
      isOwner: conv.owner_id === userId || role === "owner",
    };
  } else {
    // Direct chat
    if (conv.user1_id !== userId && conv.user2_id !== userId) {
      await logSecurityAlert(workspaceId, userId, role, "chat.unauthorized_participant_denied", {
        attemptedConversationId: data.conversationId,
      });
      throw new Error("FORBIDDEN: You are not a participant in this conversation.");
    }

    // Mark unread messages directed to current user as read
    await execute(
      `UPDATE chat_messages
       SET is_read = 1, read_at = NOW()
       WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0 AND expires_at > NOW()`,
      [data.conversationId, userId],
    );

    // Fetch messages
    const messages = await query<ChatMessage>(
      `SELECT id, workspace_id, conversation_id, sender_id, receiver_id, body, is_read, read_at, created_at, expires_at
       FROM chat_messages
       WHERE conversation_id = ? AND workspace_id = ? AND expires_at > NOW()
       ORDER BY created_at ASC`,
      [data.conversationId, workspaceId],
    );

    // Resolve other participant
    const otherId = (conv.user1_id === userId ? conv.user2_id : conv.user1_id) ?? "";
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

    return {
      conversation: conv,
      participant,
      messages,
      retentionDays,
    };
  }
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
 * Total unread message count (Direct + Groups) for the current user.
 * Powers the navigation badge.
 */
export async function getChatUnreadCountCore(
  context: ServerAuthContext,
): Promise<{ unreadCount: number }> {
  const { userId, workspaceId } = context;
  if (!workspaceId) return { unreadCount: 0 };

  // 1. Direct unread count
  const directRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM chat_messages
     WHERE workspace_id = ? AND receiver_id = ? AND is_read = 0 AND expires_at > NOW()`,
    [workspaceId, userId],
  );

  // 2. Group unread count
  const groupRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM chat_messages m
     JOIN chat_conversation_members cm ON m.conversation_id = cm.conversation_id AND cm.user_id = ? AND cm.status = 'active'
     JOIN chat_conversations c ON c.id = m.conversation_id AND c.status = 'active'
     WHERE m.workspace_id = ? AND m.sender_id != ?
       AND m.created_at >= cm.joined_at
       AND m.created_at > COALESCE(cm.last_read_at, cm.joined_at)
       AND m.expires_at > NOW()`,
    [userId, workspaceId, userId],
  );

  const total = Number(directRow?.count ?? 0) + Number(groupRow?.count ?? 0);
  return { unreadCount: total };
}

export const getChatUnreadCountFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<{ unreadCount: number }> => {
    return getChatUnreadCountCore(context as unknown as ServerAuthContext);
  });

/**
 * List other active members of the workspace available to start a 1:1 chat or add to a group.
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
 * Send a message in a conversation (Direct or Group).
 * Supports conversationId or recipientId (for new direct).
 */
export async function sendChatMessageCore(
  context: ServerAuthContext,
  data: {
    conversationId?: string | undefined;
    recipientId?: string | undefined;
    body: string;
  },
): Promise<{ message: ChatMessage; conversationId: string }> {
  if (context.isViewingAs) {
    throw new Error("Action not permitted in view-as preview mode. Switch back to your account to perform this action.");
  }

  const { userId, workspaceId, role } = context;
  if (!workspaceId) {
    throw new Error("Unauthorized: No active workspace associated with session.");
  }

  // 1. Verify sender is active in current workspace
  await assertActiveSender(userId, workspaceId);

  let convId = data.conversationId;
  let targetRecipientId: string | null = data.recipientId ?? null;
  let isGroup = false;

  if (convId) {
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

    isGroup = conv.type === "group";

    if (isGroup) {
      // Group message validation
      if (conv.status === "archived") {
        throw new Error("Cannot send messages to an archived group.");
      }

      // Check sender is active member in chat_conversation_members
      const member = await queryOne<ChatConversationMember>(
        "SELECT * FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
        [convId, userId],
      );

      if (!member) {
        await logSecurityAlert(workspaceId, userId, role, "chat.unauthorized_group_send_denied", {
          targetConversationId: convId,
        });
        throw new Error("FORBIDDEN: You are not an active member of this group.");
      }

      targetRecipientId = null;
    } else {
      // Direct message validation
      if (conv.user1_id !== userId && conv.user2_id !== userId) {
        await logSecurityAlert(workspaceId, userId, role, "chat.unauthorized_send_denied", {
          targetConversationId: convId,
        });
        throw new Error("FORBIDDEN: You are not a participant in this conversation.");
      }

      targetRecipientId = conv.user1_id === userId ? conv.user2_id! : conv.user1_id!;
    }
  } else if (targetRecipientId) {
    // Starting direct conversation
    if (targetRecipientId === userId) {
      throw new Error("Cannot start conversation with yourself.");
    }

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

    const [u1, u2] = userId < targetRecipientId ? [userId, targetRecipientId] : [targetRecipientId, userId];

    const existingConv = await queryOne<ChatConversation>(
      "SELECT * FROM chat_conversations WHERE workspace_id = ? AND user1_id = ? AND user2_id = ? LIMIT 1",
      [workspaceId, u1, u2],
    );

    if (existingConv) {
      convId = existingConv.id;
    } else {
      convId = uuid();
      await execute(
        `INSERT INTO chat_conversations (id, workspace_id, type, user1_id, user2_id, last_message_at)
         VALUES (?, ?, 'direct', ?, ?, NOW())`,
        [convId, workspaceId, u1, u2],
      );
    }
  } else {
    throw new Error("Either conversationId or recipientId must be provided.");
  }

  if (!convId) {
    throw new Error("Unable to resolve chat conversation.");
  }

  // If direct, verify recipient is still active
  if (!isGroup && targetRecipientId) {
    const recipientCheck = await queryOne<Profile>(
      "SELECT id, is_active FROM profiles WHERE id = ? AND workspace_id = ? LIMIT 1",
      [targetRecipientId, workspaceId],
    );
    if (!recipientCheck?.is_active) {
      throw new Error("Cannot send message to a deactivated user.");
    }
  }

  // Expiration calculation: expires_at = NOW() + workspace_retention_days (max 15 days)
  const retentionDays = await getWorkspaceRetentionDays(workspaceId);
  const messageId = uuid();

  await execute(
    `INSERT INTO chat_messages (id, workspace_id, conversation_id, sender_id, receiver_id, body, is_read, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [messageId, workspaceId, convId, userId, targetRecipientId, data.body, retentionDays],
  );

  await execute(
    "UPDATE chat_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?",
    [convId],
  );

  // If group, update sender's last_read_at
  if (isGroup) {
    await execute(
      "UPDATE chat_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?",
      [convId, userId],
    );
  }

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
 * Mark conversation as read for the current viewer.
 */
export async function markConversationReadCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{ success: boolean }> {
  const { userId, workspaceId } = context;
  if (!workspaceId) return { success: false };

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, user1_id, user2_id FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId) return { success: false };

  if (conv.type === "group") {
    await execute(
      "UPDATE chat_conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ? AND status = 'active'",
      [data.conversationId, userId],
    );
  } else {
    if (conv.user1_id !== userId && conv.user2_id !== userId) return { success: false };
    await execute(
      `UPDATE chat_messages
       SET is_read = 1, read_at = NOW()
       WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0`,
      [data.conversationId, userId],
    );
  }

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

/* --------------------------- group management ----------------------------- */

/**
 * Create a new group chat.
 * Strictly Owner-only.
 * Automatically adds the Owner as a member with role 'owner'.
 * Validates unique group name per workspace.
 */
export async function createChatGroupCore(
  context: ServerAuthContext,
  data: {
    title: string;
    description?: string | undefined;
    memberIds: string[];
  },
): Promise<{ conversationId: string; title: string }> {
  if (context.isViewingAs) {
    throw new Error("Action not permitted in view-as preview mode.");
  }

  const { userId, workspaceId, role } = context;
  if (!workspaceId) {
    throw new Error("Unauthorized: No active workspace associated with session.");
  }

  // 1. Strictly Owner-only check
  if (role !== "owner" && role !== "super_admin") {
    await logSecurityAlert(workspaceId, userId, role, "chat.group_create_unauthorized", {
      attemptedTitle: data.title,
    });
    throw new Error("FORBIDDEN: Only the workspace Owner can create groups.");
  }

  // 2. Validate title
  const title = data.title.trim();
  if (!title || title.length < 2) {
    throw new Error("Group name must be at least 2 characters.");
  }
  if (title.length > 100) {
    throw new Error("Group name cannot exceed 100 characters.");
  }

  // 3. Prevent duplicate active group name in workspace
  const duplicate = await queryOne<ChatConversation>(
    "SELECT id FROM chat_conversations WHERE workspace_id = ? AND type = 'group' AND status = 'active' AND LOWER(title) = LOWER(?) LIMIT 1",
    [workspaceId, title],
  );
  if (duplicate) {
    throw new Error(`A group named "${title}" already exists in this workspace.`);
  }

  // 4. Validate member IDs
  // Ensure Owner is always included
  const rawMemberSet = new Set(data.memberIds ?? []);
  rawMemberSet.add(userId);
  const targetMemberIds = Array.from(rawMemberSet);

  // Verify all target members belong to the current workspace and are active
  const placeholders = targetMemberIds.map(() => "?").join(", ");
  const activeProfiles = await query<Profile>(
    `SELECT id, is_active FROM profiles WHERE workspace_id = ? AND id IN (${placeholders})`,
    [workspaceId, ...targetMemberIds],
  );

  const activeIdSet = new Set(activeProfiles.filter((p) => p.is_active).map((p) => p.id));
  if (!activeIdSet.has(userId)) {
    throw new Error("Current user account is deactivated.");
  }

  // Check if any specified member was invalid/inactive
  for (const mid of targetMemberIds) {
    if (!activeIdSet.has(mid)) {
      throw new Error("Cannot add inactive or cross-workspace members to the group.");
    }
  }

  // 5. Create conversation & members transactionally
  const conversationId = uuid();
  const desc = data.description?.trim() || null;

  await transaction(async (conn) => {
    // Insert conversation
    await conn.query(
      `INSERT INTO chat_conversations (id, workspace_id, type, title, description, owner_id, status, created_at)
       VALUES (?, ?, 'group', ?, ?, ?, 'active', NOW())`,
      [conversationId, workspaceId, title, desc, userId],
    );

    // Insert members
    for (const mid of targetMemberIds) {
      const memberRole = mid === userId ? "owner" : "member";
      await conn.query(
        `INSERT INTO chat_conversation_members (id, conversation_id, workspace_id, user_id, role, joined_at, status)
         VALUES (?, ?, ?, ?, ?, NOW(), 'active')`,
        [uuid(), conversationId, workspaceId, mid, memberRole],
      );
    }

    // Insert system welcome message
    const retentionDays = await getWorkspaceRetentionDays(workspaceId);
    await conn.query(
      `INSERT INTO chat_messages (id, workspace_id, conversation_id, sender_id, receiver_id, body, is_read, created_at, expires_at)
       VALUES (?, ?, ?, ?, NULL, ?, 0, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [
        uuid(),
        workspaceId,
        conversationId,
        userId,
        `Welcome to #${title}! Group created by the workspace Owner.`,
        retentionDays,
      ],
    );

    await conn.query(
      "UPDATE chat_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ?",
      [conversationId],
    );
  });

  // 6. Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      workspaceId,
      userId,
      "Owner",
      "GROUP_CREATED",
      "chat_group",
      conversationId,
      JSON.stringify({ title, memberCount: targetMemberIds.length }),
    ],
  );

  return { conversationId, title };
}

export const createChatGroupFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { title: string; description?: string | undefined; memberIds: string[] }) => {
    if (!input?.title?.trim()) throw new Error("Group title is required.");
    return {
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      memberIds: Array.isArray(input.memberIds) ? input.memberIds : [],
    };
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Creating group chat");
    return createChatGroupCore(context as unknown as ServerAuthContext, data);
  });

/**
 * List all members of a group with their profile details and joined date.
 */
export async function getGroupMembersCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<ChatConversationMember[]> {
  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  // Must be member or owner to view member list
  const isMember = await queryOne<ChatConversationMember>(
    "SELECT id FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
    [data.conversationId, userId],
  );

  if (!isMember && role !== "owner" && role !== "super_admin") {
    throw new Error("FORBIDDEN: You are not a member of this group.");
  }

  const rows = await query<ChatConversationMember>(
    `SELECT cm.id, cm.conversation_id, cm.workspace_id, cm.user_id, cm.role,
            cm.joined_at, cm.left_at, cm.status, cm.last_read_at, cm.created_at, cm.updated_at,
            p.user_code, p.full_name, p.job_title, p.avatar_url, p.is_active
     FROM chat_conversation_members cm
     JOIN profiles p ON cm.user_id = p.id
     WHERE cm.conversation_id = ? AND cm.workspace_id = ? AND cm.status = 'active'
     ORDER BY (cm.role = 'owner') DESC, p.full_name ASC`,
    [data.conversationId, workspaceId],
  );

  return rows.map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
  }));
}

export const getGroupMembersFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    return getGroupMembersCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Add members to a group.
 * Strictly Owner-only.
 * A newly added member will see messages from this join time onward!
 */
export async function addGroupMembersCore(
  context: ServerAuthContext,
  data: { conversationId: string; userIds: string[] },
): Promise<{ success: boolean; addedCount: number }> {
  if (context.isViewingAs) throw new Error("Action not permitted in view-as preview mode.");

  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id, status FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  // Owner-only check
  if (role !== "owner" && role !== "super_admin" && conv.owner_id !== userId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.group_add_member_unauthorized", {
      conversationId: data.conversationId,
    });
    throw new Error("FORBIDDEN: Only the group owner can add members.");
  }

  if (conv.status === "archived") {
    throw new Error("Cannot add members to an archived group.");
  }

  const targetIds = Array.from(new Set(data.userIds.filter(Boolean)));
  if (targetIds.length === 0) {
    return { success: true, addedCount: 0 };
  }

  // Verify all users belong to workspace and are active
  const placeholders = targetIds.map(() => "?").join(", ");
  const activeProfiles = await query<Profile>(
    `SELECT id, is_active FROM profiles WHERE workspace_id = ? AND id IN (${placeholders})`,
    [workspaceId, ...targetIds],
  );

  const activeIdSet = new Set(activeProfiles.filter((p) => p.is_active).map((p) => p.id));
  for (const tid of targetIds) {
    if (!activeIdSet.has(tid)) {
      throw new Error("Cannot add inactive or cross-workspace users to the group.");
    }
  }

  // Add/Re-activate members transactionally
  let addedCount = 0;
  await transaction(async (conn) => {
    for (const mid of targetIds) {
      const existing = await queryOne<ChatConversationMember>(
        "SELECT id, status FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1",
        [data.conversationId, mid],
      );

      if (existing) {
        if (existing.status !== "active") {
          // Re-activate with fresh joined_at so they only see messages from now on
          await conn.query(
            `UPDATE chat_conversation_members
             SET status = 'active', role = 'member', joined_at = NOW(), left_at = NULL, updated_at = NOW()
             WHERE id = ?`,
            [existing.id],
          );
          addedCount++;
        }
      } else {
        await conn.query(
          `INSERT INTO chat_conversation_members (id, conversation_id, workspace_id, user_id, role, joined_at, status)
           VALUES (?, ?, ?, ?, 'member', NOW(), 'active')`,
          [uuid(), data.conversationId, workspaceId, mid],
        );
        addedCount++;
      }
    }
  });

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      workspaceId,
      userId,
      "Owner",
      "GROUP_MEMBER_ADDED",
      "chat_group",
      data.conversationId,
      JSON.stringify({ addedUserIds: targetIds, addedCount }),
    ],
  );

  return { success: true, addedCount };
}

export const addGroupMembersFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string; userIds: string[] }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    if (!Array.isArray(input.userIds) || input.userIds.length === 0) {
      throw new Error("At least one user must be selected.");
    }
    return {
      conversationId: input.conversationId.trim(),
      userIds: input.userIds,
    };
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Adding group members");
    return addGroupMembersCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Remove a member from a group.
 * Strictly Owner-only.
 * Prevents removing the group owner.
 */
export async function removeGroupMemberCore(
  context: ServerAuthContext,
  data: { conversationId: string; targetUserId: string },
): Promise<{ success: boolean }> {
  if (context.isViewingAs) throw new Error("Action not permitted in view-as preview mode.");

  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  // Owner check
  if (role !== "owner" && role !== "super_admin" && conv.owner_id !== userId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.group_remove_member_unauthorized", {
      conversationId: data.conversationId,
      targetUserId: data.targetUserId,
    });
    throw new Error("FORBIDDEN: Only the group owner can remove members.");
  }

  // Owner protection: cannot remove group owner
  if (data.targetUserId === conv.owner_id) {
    throw new Error("Cannot remove the group owner from the group.");
  }

  await execute(
    `UPDATE chat_conversation_members
     SET status = 'removed', left_at = NOW(), updated_at = NOW()
     WHERE conversation_id = ? AND user_id = ?`,
    [data.conversationId, data.targetUserId],
  );

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      workspaceId,
      userId,
      "Owner",
      "GROUP_MEMBER_REMOVED",
      "chat_group",
      data.conversationId,
      JSON.stringify({ removedUserId: data.targetUserId }),
    ],
  );

  return { success: true };
}

export const removeGroupMemberFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string; targetUserId: string }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    if (!input?.targetUserId?.trim()) throw new Error("Target user ID is required.");
    return {
      conversationId: input.conversationId.trim(),
      targetUserId: input.targetUserId.trim(),
    };
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Removing group member");
    return removeGroupMemberCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Leave a group (for Employees).
 * Owner cannot leave their own group.
 */
export async function leaveChatGroupCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{ success: boolean }> {
  if (context.isViewingAs) throw new Error("Action not permitted in view-as preview mode.");

  const { userId, workspaceId } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  // Owner protection
  if (userId === conv.owner_id) {
    throw new Error("Group owner cannot leave the group. Archive or delete the group instead.");
  }

  await execute(
    `UPDATE chat_conversation_members
     SET status = 'left', left_at = NOW(), updated_at = NOW()
     WHERE conversation_id = ? AND user_id = ?`,
    [data.conversationId, userId],
  );

  return { success: true };
}

export const leaveChatGroupFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Leaving group");
    return leaveChatGroupCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Rename a group chat.
 * Strictly Owner-only.
 */
export async function renameChatGroupCore(
  context: ServerAuthContext,
  data: { conversationId: string; title: string; description?: string | undefined },
): Promise<{ success: boolean; title: string }> {
  if (context.isViewingAs) throw new Error("Action not permitted in view-as preview mode.");

  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id, title FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  if (role !== "owner" && role !== "super_admin" && conv.owner_id !== userId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.group_rename_unauthorized", {
      conversationId: data.conversationId,
    });
    throw new Error("FORBIDDEN: Only the group owner can rename the group.");
  }

  const title = data.title.trim();
  if (!title || title.length < 2) {
    throw new Error("Group name must be at least 2 characters.");
  }
  if (title.length > 100) {
    throw new Error("Group name cannot exceed 100 characters.");
  }

  // Check duplicate
  const duplicate = await queryOne<ChatConversation>(
    "SELECT id FROM chat_conversations WHERE workspace_id = ? AND type = 'group' AND status = 'active' AND LOWER(title) = LOWER(?) AND id != ? LIMIT 1",
    [workspaceId, title, data.conversationId],
  );
  if (duplicate) {
    throw new Error(`Another group named "${title}" already exists.`);
  }

  const desc = data.description?.trim() || null;
  await execute(
    "UPDATE chat_conversations SET title = ?, description = ?, updated_at = NOW() WHERE id = ?",
    [title, desc, data.conversationId],
  );

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      workspaceId,
      userId,
      "Owner",
      "GROUP_RENAMED",
      "chat_group",
      data.conversationId,
      JSON.stringify({ previousTitle: conv.title, newTitle: title }),
    ],
  );

  return { success: true, title };
}

export const renameChatGroupFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string; title: string; description?: string | undefined }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    if (!input?.title?.trim()) throw new Error("Group title is required.");
    return {
      conversationId: input.conversationId.trim(),
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
    };
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Renaming group");
    return renameChatGroupCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Archive a group chat.
 * Strictly Owner-only.
 * Disappears from active conversation list and blocks new messages.
 */
export async function archiveChatGroupCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{ success: boolean }> {
  if (context.isViewingAs) throw new Error("Action not permitted in view-as preview mode.");

  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id, title FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  if (role !== "owner" && role !== "super_admin" && conv.owner_id !== userId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.group_archive_unauthorized", {
      conversationId: data.conversationId,
    });
    throw new Error("FORBIDDEN: Only the group owner can archive the group.");
  }

  await execute(
    "UPDATE chat_conversations SET status = 'archived', updated_at = NOW() WHERE id = ?",
    [data.conversationId],
  );

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      workspaceId,
      userId,
      "Owner",
      "GROUP_ARCHIVED",
      "chat_group",
      data.conversationId,
      JSON.stringify({ title: conv.title }),
    ],
  );

  return { success: true };
}

export const archiveChatGroupFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Archiving group");
    return archiveChatGroupCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Restore an archived group chat back to active.
 * Strictly Owner-only.
 */
export async function restoreChatGroupCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{ success: boolean }> {
  if (context.isViewingAs) throw new Error("Action not permitted in view-as preview mode.");

  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id, title FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  if (role !== "owner" && role !== "super_admin" && conv.owner_id !== userId) {
    throw new Error("FORBIDDEN: Only the group owner can restore the group.");
  }

  // Check duplicate active name
  const duplicate = await queryOne<ChatConversation>(
    "SELECT id FROM chat_conversations WHERE workspace_id = ? AND type = 'group' AND status = 'active' AND LOWER(title) = LOWER(?) LIMIT 1",
    [workspaceId, conv.title],
  );
  if (duplicate) {
    throw new Error(`Another active group named "${conv.title}" already exists. Rename before restoring.`);
  }

  await execute(
    "UPDATE chat_conversations SET status = 'active', updated_at = NOW() WHERE id = ?",
    [data.conversationId],
  );

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      workspaceId,
      userId,
      "Owner",
      "GROUP_RESTORED",
      "chat_group",
      data.conversationId,
      JSON.stringify({ title: conv.title }),
    ],
  );

  return { success: true };
}

export const restoreChatGroupFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Restoring group");
    return restoreChatGroupCore(context as unknown as ServerAuthContext, data);
  });

/**
 * Permanently delete a group chat and its messages.
 * Strictly Owner-only. Irreversible.
 */
export async function deleteChatGroupCore(
  context: ServerAuthContext,
  data: { conversationId: string },
): Promise<{ success: boolean }> {
  if (context.isViewingAs) throw new Error("Action not permitted in view-as preview mode.");

  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  const conv = await queryOne<ChatConversation>(
    "SELECT id, workspace_id, type, owner_id, title FROM chat_conversations WHERE id = ? LIMIT 1",
    [data.conversationId],
  );

  if (!conv || conv.workspace_id !== workspaceId || conv.type !== "group") {
    throw new Error("Group conversation not found.");
  }

  if (role !== "owner" && role !== "super_admin" && conv.owner_id !== userId) {
    await logSecurityAlert(workspaceId, userId, role, "chat.group_delete_unauthorized", {
      conversationId: data.conversationId,
    });
    throw new Error("FORBIDDEN: Only the group owner can delete the group.");
  }

  await transaction(async (conn) => {
    await conn.query("DELETE FROM chat_messages WHERE conversation_id = ?", [data.conversationId]);
    await conn.query("DELETE FROM chat_conversation_members WHERE conversation_id = ?", [data.conversationId]);
    await conn.query("DELETE FROM chat_conversations WHERE id = ?", [data.conversationId]);
  });

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      workspaceId,
      userId,
      "Owner",
      "GROUP_DELETED",
      "chat_group",
      data.conversationId,
      JSON.stringify({ title: conv.title }),
    ],
  );

  return { success: true };
}

export const deleteChatGroupFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { conversationId: string }) => {
    if (!input?.conversationId?.trim()) throw new Error("Conversation ID is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Deleting group");
    return deleteChatGroupCore(context as unknown as ServerAuthContext, data);
  });

/**
 * List archived groups for the current workspace.
 * Owner-only.
 */
export async function listArchivedChatGroupsCore(
  context: ServerAuthContext,
): Promise<ChatConversationSummary[]> {
  const { userId, workspaceId, role } = context;
  if (!workspaceId) throw new Error("Unauthorized.");

  if (role !== "owner" && role !== "super_admin") {
    throw new Error("FORBIDDEN: Only the workspace Owner can view archived groups.");
  }

  const convs = await query<ChatConversation>(
    `SELECT id, workspace_id, type, title, description, owner_id, status, last_message_at, created_at, updated_at
     FROM chat_conversations
     WHERE workspace_id = ? AND type = 'group' AND status = 'archived'
     ORDER BY updated_at DESC`,
    [workspaceId],
  );

  return convs.map((c) => ({
    id: c.id,
    workspace_id: c.workspace_id,
    type: "group",
    title: c.title,
    description: c.description,
    owner_id: c.owner_id,
    status: "archived",
    participant: null,
    lastMessage: null,
    unreadCount: 0,
    updated_at: c.updated_at,
  }));
}

export const listArchivedChatGroupsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    return listArchivedChatGroupsCore(context as unknown as ServerAuthContext);
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

  const prevRetention = await getWorkspaceRetentionDays(data.workspaceId);

  await execute("UPDATE workspaces SET chat_retention_days = ? WHERE id = ?", [
    data.retentionDays,
    data.workspaceId,
  ]);

  let updatedMessages = 0;
  let deletedExpired = 0;

  if (data.retentionDays < prevRetention) {
    const cleanupRes = await applyRetentionReduction(data.workspaceId, data.retentionDays);
    updatedMessages = cleanupRes.updatedMessages;
    deletedExpired = cleanupRes.deletedExpired;
  }

  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      data.workspaceId,
      context.userId,
      "Super Admin",
      "TEAM_CHAT_RETENTION_CHANGED",
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
