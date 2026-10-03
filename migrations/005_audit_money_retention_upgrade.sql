-- ============================================================================
-- BLUETORN CRM — MIGRATION: AUDIT LOGS, NOTIFICATIONS & RETENTION UPGRADE
-- Target: MySQL 8.0+ / MariaDB 10.3+ (Hostinger phpMyAdmin / MySQL CLI)
-- Engine: InnoDB, Charset: utf8mb4 / utf8mb4_unicode_ci
-- Safe & Non-destructive: Forward-only schema extension preserving all records.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WORKSPACES: AUDIT RETENTION DAYS SETTING
-- ----------------------------------------------------------------------------
-- Configurable retention period for audit logs per workspace (90, 180, 365, 730 days)
ALTER TABLE `workspaces`
  ADD COLUMN IF NOT EXISTS `audit_retention_days` INT NOT NULL DEFAULT 180 AFTER `chat_retention_days`;

-- ----------------------------------------------------------------------------
-- 2. AUDIT LOGS: STATUS & USER AGENT METADATA COLUMNS
-- ----------------------------------------------------------------------------
ALTER TABLE `audit_logs`
  ADD COLUMN IF NOT EXISTS `status` VARCHAR(32) NOT NULL DEFAULT 'success' AFTER `action`,
  ADD COLUMN IF NOT EXISTS `user_agent` TEXT DEFAULT NULL AFTER `ip_address`;

-- Performance indexes for audit log filtering and server-side pagination
ALTER TABLE `audit_logs`
  ADD KEY IF NOT EXISTS `idx_audit_ws_entity` (`workspace_id`, `entity_type`, `created_at`),
  ADD KEY IF NOT EXISTS `idx_audit_ws_action` (`workspace_id`, `action`, `created_at`),
  ADD KEY IF NOT EXISTS `idx_audit_ws_actor` (`workspace_id`, `actor_id`, `created_at`);

-- ----------------------------------------------------------------------------
-- 3. NOTIFICATIONS: RETENTION CLEANUP INDEX
-- ----------------------------------------------------------------------------
ALTER TABLE `notifications`
  ADD KEY IF NOT EXISTS `idx_notifications_retention` (`created_at`, `is_read`);
