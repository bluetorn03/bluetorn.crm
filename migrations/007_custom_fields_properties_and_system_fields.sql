-- ============================================================================
-- BLUETORN CRM — MIGRATION 007: PROPERTIES CUSTOM FIELDS & SYSTEM FIELDS MANAGEMENT
-- Target: MySQL 8.0+ / MariaDB 10.3+ (Hostinger phpMyAdmin / MySQL CLI)
-- Engine: InnoDB, Charset: utf8mb4 / utf8mb4_unicode_ci
-- Safe & Non-destructive: Forward-only schema extension preserving all data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND WORKSPACE CUSTOM FIELDS ENTITY TYPE TO SUPPORT PROPERTIES
-- ----------------------------------------------------------------------------
ALTER TABLE `workspace_custom_fields`
  MODIFY COLUMN `entity_type` ENUM('lead', 'customer', 'property') NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. ADD CONFIGURATION COLUMNS TO WORKSPACE CUSTOM FIELDS
-- ----------------------------------------------------------------------------
ALTER TABLE `workspace_custom_fields`
  ADD COLUMN IF NOT EXISTS `placeholder` VARCHAR(255) DEFAULT NULL AFTER `field_label`,
  ADD COLUMN IF NOT EXISTS `is_unique` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_required`,
  ADD COLUMN IF NOT EXISTS `is_system` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_unique`,
  ADD COLUMN IF NOT EXISTS `is_visible` TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_system`;

-- ----------------------------------------------------------------------------
-- 3. ADD DYNAMIC CUSTOM FIELDS JSON STORAGE TO PROPERTIES TABLE
-- ----------------------------------------------------------------------------
ALTER TABLE `properties`
  ADD COLUMN IF NOT EXISTS `custom_fields` JSON DEFAULT NULL AFTER `description`;
