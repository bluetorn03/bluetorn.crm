-- ============================================================================
-- BLUETORN CRM — MIGRATION: CONFIGURABLE LEAD OPTIONS + LEAD UPGRADE
-- Target: MySQL 8.0+ / MariaDB 10.3+ (Hostinger phpMyAdmin / MySQL CLI)
-- Engine: InnoDB, Charset: utf8mb4 / utf8mb4_unicode_ci
-- Safe & Non-destructive: Preserves all existing CRM records & campaign column.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LEAD OPTIONS TABLE (REUSABLE LOOKUP SYSTEM ACROSS WORKSPACES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lead_options` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `type` ENUM('source', 'location', 'purpose', 'possession_timeline', 'transaction_timeline', 'phase') NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `stable_key` VARCHAR(64) DEFAULT NULL,
  `is_system` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `updated_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lead_options_ws_type_name` (`workspace_id`, `type`, `name`),
  KEY `idx_lead_options_ws_type_active` (`workspace_id`, `type`, `is_active`, `sort_order`),
  KEY `idx_lead_options_ws_stable_key` (`workspace_id`, `type`, `stable_key`),
  CONSTRAINT `fk_lead_options_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. LEADS TABLE: ADD NULLABLE OPTION-REFERENCE FIELDS
-- ----------------------------------------------------------------------------
-- Note: campaign and legacy source columns are preserved for backward compatibility.
ALTER TABLE `leads`
  ADD COLUMN `source_option_id` VARCHAR(36) DEFAULT NULL AFTER `source`,
  ADD COLUMN `location_option_id` VARCHAR(36) DEFAULT NULL AFTER `requirement`,
  ADD COLUMN `purpose_option_id` VARCHAR(36) DEFAULT NULL AFTER `location_option_id`,
  ADD COLUMN `possession_timeline_option_id` VARCHAR(36) DEFAULT NULL AFTER `purpose_option_id`,
  ADD COLUMN `transaction_timeline_option_id` VARCHAR(36) DEFAULT NULL AFTER `possession_timeline_option_id`,
  ADD COLUMN `phase_option_id` VARCHAR(36) DEFAULT NULL AFTER `transaction_timeline_option_id`;

-- Indexes and foreign keys for option references (ON DELETE SET NULL ensures leads are never cascaded)
ALTER TABLE `leads`
  ADD KEY `idx_leads_source_opt` (`source_option_id`),
  ADD KEY `idx_leads_location_opt` (`location_option_id`),
  ADD KEY `idx_leads_purpose_opt` (`purpose_option_id`),
  ADD KEY `idx_leads_possession_opt` (`possession_timeline_option_id`),
  ADD KEY `idx_leads_transaction_opt` (`transaction_timeline_option_id`),
  ADD KEY `idx_leads_phase_opt` (`phase_option_id`),
  ADD CONSTRAINT `fk_leads_source_opt` FOREIGN KEY (`source_option_id`) REFERENCES `lead_options` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_leads_location_opt` FOREIGN KEY (`location_option_id`) REFERENCES `lead_options` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_leads_purpose_opt` FOREIGN KEY (`purpose_option_id`) REFERENCES `lead_options` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_leads_possession_opt` FOREIGN KEY (`possession_timeline_option_id`) REFERENCES `lead_options` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_leads_transaction_opt` FOREIGN KEY (`transaction_timeline_option_id`) REFERENCES `lead_options` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_leads_phase_opt` FOREIGN KEY (`phase_option_id`) REFERENCES `lead_options` (`id`) ON DELETE SET NULL;
