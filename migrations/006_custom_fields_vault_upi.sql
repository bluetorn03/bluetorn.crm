-- ============================================================================
-- BLUETORN CRM — MIGRATION 006: CUSTOM FIELDS, DOCUMENT VAULT & UPI PAYMENTS
-- Target: MySQL 8.0+ / MariaDB 10.3+ (Hostinger phpMyAdmin / MySQL CLI)
-- Engine: InnoDB, Charset: utf8mb4 / utf8mb4_unicode_ci
-- Safe & Non-destructive: Forward-only schema extension preserving all data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WORKSPACE CUSTOM FIELDS METADATA TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workspace_custom_fields` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `entity_type` ENUM('lead', 'customer') NOT NULL,
  `field_key` VARCHAR(64) NOT NULL,
  `field_label` VARCHAR(128) NOT NULL,
  `field_type` ENUM('text', 'number', 'date', 'select', 'textarea') NOT NULL DEFAULT 'text',
  `options` JSON DEFAULT NULL,
  `is_required` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wcf_ws_entity_key` (`workspace_id`, `entity_type`, `field_key`),
  KEY `idx_wcf_ws_entity` (`workspace_id`, `entity_type`, `sort_order`),
  CONSTRAINT `fk_wcf_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. DYNAMIC CUSTOM FIELDS VALUE STORAGE IN LEADS & CUSTOMERS
-- ----------------------------------------------------------------------------
ALTER TABLE `leads`
  ADD COLUMN IF NOT EXISTS `custom_fields` JSON DEFAULT NULL AFTER `notes`;

ALTER TABLE `customers`
  ADD COLUMN IF NOT EXISTS `custom_fields` JSON DEFAULT NULL AFTER `notes`;

-- ----------------------------------------------------------------------------
-- 3. DOCUMENT ATTACHMENTS VAULT (LEADS, CUSTOMERS, PROPERTIES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `document_attachments` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `entity_type` ENUM('lead', 'customer', 'property') NOT NULL,
  `entity_id` VARCHAR(36) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_url` TEXT NOT NULL,
  `file_size` BIGINT NOT NULL DEFAULT 0,
  `mime_type` VARCHAR(128) NOT NULL,
  `category` VARCHAR(64) NOT NULL DEFAULT 'General',
  `uploaded_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_ws_entity` (`workspace_id`, `entity_type`, `entity_id`),
  KEY `idx_doc_uploader` (`uploaded_by`),
  CONSTRAINT `fk_doc_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_doc_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. WORKSPACES: DYNAMIC UPI PAYMENT CONFIGURATION
-- ----------------------------------------------------------------------------
ALTER TABLE `workspaces`
  ADD COLUMN IF NOT EXISTS `upi_id` VARCHAR(128) DEFAULT NULL AFTER `bank_ifsc`,
  ADD COLUMN IF NOT EXISTS `upi_merchant_name` VARCHAR(128) DEFAULT NULL AFTER `upi_id`;
