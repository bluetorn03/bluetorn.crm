-- ============================================================================
-- BLUETORN CRM — TEAM CHAT V1 MIGRATION
-- Engine: InnoDB, Charset: utf8mb4 / utf8mb4_unicode_ci
-- ============================================================================

-- 1. Add chat_retention_days to workspaces (Default: 15, Max: 15)
-- Note: Check if column exists first or use ALTER TABLE safely via migration script
ALTER TABLE `workspaces`
  ADD COLUMN `chat_retention_days` INT NOT NULL DEFAULT 15 AFTER `seat_limit`;

-- 2. Create chat_conversations table (1:1 conversations between workspace users)
CREATE TABLE IF NOT EXISTS `chat_conversations` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `user1_id` VARCHAR(36) NOT NULL,
  `user2_id` VARCHAR(36) NOT NULL,
  `last_message_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_chat_conversation_pair` (`workspace_id`, `user1_id`, `user2_id`),
  KEY `idx_chat_conv_ws` (`workspace_id`),
  KEY `idx_chat_conv_u1` (`user1_id`),
  KEY `idx_chat_conv_u2` (`user2_id`),
  KEY `idx_chat_conv_last_msg` (`workspace_id`, `last_message_at`),
  CONSTRAINT `fk_chat_conv_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_conv_u1` FOREIGN KEY (`user1_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_conv_u2` FOREIGN KEY (`user2_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create chat_messages table (workspace-scoped, indexed by expires_at for scheduled cleanup)
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `conversation_id` VARCHAR(36) NOT NULL,
  `sender_id` VARCHAR(36) NOT NULL,
  `receiver_id` VARCHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `read_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_chat_msg_ws` (`workspace_id`),
  KEY `idx_chat_msg_conv_created` (`conversation_id`, `created_at`),
  KEY `idx_chat_msg_receiver_read` (`workspace_id`, `receiver_id`, `is_read`),
  KEY `idx_chat_msg_expires` (`expires_at`),
  CONSTRAINT `fk_chat_msg_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_msg_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_msg_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
