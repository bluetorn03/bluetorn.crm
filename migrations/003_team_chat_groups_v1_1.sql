-- ============================================================================
-- BLUETORN CRM — MIGRATION 003: TEAM CHAT GROUPS V1.1
-- ============================================================================
-- Extends Team Chat V1 with Owner-Created Group Chat.
-- Preserves existing Direct Chat conversations, messages, and retention.
-- ============================================================================

-- 1. Modify `chat_conversations` table to support groups
-- Make user1_id and user2_id nullable for group chats
ALTER TABLE `chat_conversations`
  MODIFY COLUMN `user1_id` VARCHAR(36) NULL,
  MODIFY COLUMN `user2_id` VARCHAR(36) NULL;

-- Add group-specific columns if they do not exist
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'type');
SET @sql = IF(@col_exists = 0, "ALTER TABLE `chat_conversations` ADD COLUMN `type` VARCHAR(20) NOT NULL DEFAULT 'direct' AFTER `workspace_id`", "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'title');
SET @sql = IF(@col_exists = 0, "ALTER TABLE `chat_conversations` ADD COLUMN `title` VARCHAR(120) NULL AFTER `type`", "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'description');
SET @sql = IF(@col_exists = 0, "ALTER TABLE `chat_conversations` ADD COLUMN `description` TEXT NULL AFTER `title`", "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'owner_id');
SET @sql = IF(@col_exists = 0, "ALTER TABLE `chat_conversations` ADD COLUMN `owner_id` VARCHAR(36) NULL AFTER `description`", "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'status');
SET @sql = IF(@col_exists = 0, "ALTER TABLE `chat_conversations` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active' AFTER `owner_id`", "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on (workspace_id, type, status)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND INDEX_NAME = 'idx_chat_conv_ws_type_status');
SET @sql = IF(@idx_exists = 0, "ALTER TABLE `chat_conversations` ADD INDEX `idx_chat_conv_ws_type_status` (`workspace_id`, `type`, `status`)", "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Modify `chat_messages` to allow NULL receiver_id for group messages
ALTER TABLE `chat_messages`
  MODIFY COLUMN `receiver_id` VARCHAR(36) NULL;

-- 3. Create `chat_conversation_members` table
CREATE TABLE IF NOT EXISTS `chat_conversation_members` (
  `id` VARCHAR(36) NOT NULL,
  `conversation_id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `role` VARCHAR(20) NOT NULL DEFAULT 'member',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME DEFAULT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `last_read_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conv_member` (`conversation_id`, `user_id`),
  KEY `idx_conv_members_user` (`user_id`, `status`),
  KEY `idx_conv_members_ws` (`workspace_id`),
  KEY `idx_conv_members_joined` (`conversation_id`, `joined_at`),
  CONSTRAINT `fk_conv_members_conv` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_members_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_members_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
