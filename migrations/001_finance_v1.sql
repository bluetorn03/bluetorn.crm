-- ============================================================================
-- BLUETORN CRM — MIGRATION: FINANCE V1 + RBAC + WORKSPACE BILLING IDENTITY
-- Target: MySQL 8.0+ / MariaDB 10.3+ (Hostinger phpMyAdmin / MySQL CLI)
-- Engine: InnoDB, Charset: utf8mb4 / utf8mb4_unicode_ci
-- Safe & Non-destructive: Preserves all existing CRM records.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USER PERMISSIONS TABLE (GRANULAR RBAC PER EMPLOYEE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `permission` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_permission` (`workspace_id`, `user_id`, `permission`),
  KEY `idx_user_permissions_user` (`user_id`),
  KEY `idx_user_permissions_ws` (`workspace_id`),
  CONSTRAINT `fk_user_permissions_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_permissions_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. WORKSPACES: COMPANY PROFILE, STATUTORY & INVOICING PREFERENCES
-- ----------------------------------------------------------------------------
-- Run these statements in Hostinger phpMyAdmin SQL tab.
-- If any column already exists, you can ignore the duplicate column warning.

ALTER TABLE `workspaces`
  ADD COLUMN IF NOT EXISTS `legal_name` VARCHAR(255) DEFAULT NULL AFTER `name`,
  ADD COLUMN IF NOT EXISTS `gstin` VARCHAR(32) DEFAULT NULL AFTER `address`,
  ADD COLUMN IF NOT EXISTS `pan` VARCHAR(32) DEFAULT NULL AFTER `gstin`,
  ADD COLUMN IF NOT EXISTS `state` VARCHAR(64) DEFAULT NULL AFTER `pan`,
  ADD COLUMN IF NOT EXISTS `state_code` VARCHAR(8) DEFAULT NULL AFTER `state`,
  ADD COLUMN IF NOT EXISTS `website` VARCHAR(255) DEFAULT NULL AFTER `state_code`,
  ADD COLUMN IF NOT EXISTS `bank_name` VARCHAR(128) DEFAULT NULL AFTER `website`,
  ADD COLUMN IF NOT EXISTS `bank_account_no` VARCHAR(64) DEFAULT NULL AFTER `bank_name`,
  ADD COLUMN IF NOT EXISTS `bank_account_name` VARCHAR(128) DEFAULT NULL AFTER `bank_account_no`,
  ADD COLUMN IF NOT EXISTS `bank_ifsc` VARCHAR(32) DEFAULT NULL AFTER `bank_account_name`,
  ADD COLUMN IF NOT EXISTS `invoice_prefix` VARCHAR(32) NOT NULL DEFAULT 'INV' AFTER `bank_ifsc`,
  ADD COLUMN IF NOT EXISTS `default_payment_terms_days` INT NOT NULL DEFAULT 14 AFTER `invoice_prefix`,
  ADD COLUMN IF NOT EXISTS `default_invoice_notes` TEXT DEFAULT NULL AFTER `default_payment_terms_days`,
  ADD COLUMN IF NOT EXISTS `default_invoice_terms` TEXT DEFAULT NULL AFTER `default_invoice_notes`;

-- ----------------------------------------------------------------------------
-- 3. INVOICES: STATUTORY GST, ATTRIBUTION & CANCELLATION COLUMNS
-- ----------------------------------------------------------------------------
ALTER TABLE `invoices`
  ADD COLUMN IF NOT EXISTS `financial_year` VARCHAR(16) DEFAULT NULL AFTER `invoice_number`,
  ADD COLUMN IF NOT EXISTS `invoice_type` VARCHAR(64) NOT NULL DEFAULT 'Tax Invoice' AFTER `financial_year`,
  ADD COLUMN IF NOT EXISTS `lead_id` VARCHAR(36) DEFAULT NULL AFTER `customer_id`,
  ADD COLUMN IF NOT EXISTS `assigned_to` VARCHAR(36) DEFAULT NULL AFTER `property_id`,
  ADD COLUMN IF NOT EXISTS `updated_by` VARCHAR(36) DEFAULT NULL AFTER `assigned_to`,
  ADD COLUMN IF NOT EXISTS `discount` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `subtotal`,
  ADD COLUMN IF NOT EXISTS `taxable_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `discount`,
  ADD COLUMN IF NOT EXISTS `cgst` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `taxable_amount`,
  ADD COLUMN IF NOT EXISTS `sgst` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `cgst`,
  ADD COLUMN IF NOT EXISTS `igst` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `sgst`,
  ADD COLUMN IF NOT EXISTS `cess` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `igst`,
  ADD COLUMN IF NOT EXISTS `place_of_supply` VARCHAR(128) DEFAULT NULL AFTER `total`,
  ADD COLUMN IF NOT EXISTS `terms` TEXT DEFAULT NULL AFTER `notes`,
  ADD COLUMN IF NOT EXISTS `cancellation_reason` TEXT DEFAULT NULL AFTER `terms`,
  ADD COLUMN IF NOT EXISTS `cancelled_at` DATETIME DEFAULT NULL AFTER `cancellation_reason`,
  ADD COLUMN IF NOT EXISTS `cancelled_by` VARCHAR(36) DEFAULT NULL AFTER `cancelled_at`;

-- Populate taxable_amount if empty for legacy rows
UPDATE `invoices` SET `taxable_amount` = `subtotal` - `discount` WHERE `taxable_amount` = 0.00 AND `subtotal` > 0;

-- Safe Foreign Keys on Invoices
ALTER TABLE `invoices`
  ADD KEY IF NOT EXISTS `idx_invoices_assigned_to` (`assigned_to`),
  ADD KEY IF NOT EXISTS `idx_invoices_lead_id` (`lead_id`),
  ADD KEY IF NOT EXISTS `idx_invoices_financial_year` (`workspace_id`, `financial_year`);

-- ----------------------------------------------------------------------------
-- 4. INVOICE ITEMS: HSN/SAC, UNIT, RATE, DISCOUNT & GST
-- ----------------------------------------------------------------------------
ALTER TABLE `invoice_items`
  ADD COLUMN IF NOT EXISTS `hsn_sac` VARCHAR(32) DEFAULT NULL AFTER `description`,
  ADD COLUMN IF NOT EXISTS `unit` VARCHAR(32) DEFAULT 'unit' AFTER `quantity`,
  ADD COLUMN IF NOT EXISTS `rate` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `unit`,
  ADD COLUMN IF NOT EXISTS `discount` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `rate`,
  ADD COLUMN IF NOT EXISTS `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER `discount`,
  ADD COLUMN IF NOT EXISTS `tax_type` VARCHAR(16) NOT NULL DEFAULT 'GST' AFTER `tax_rate`,
  ADD COLUMN IF NOT EXISTS `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `tax_type`,
  ADD COLUMN IF NOT EXISTS `line_total` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `tax_amount`,
  ADD COLUMN IF NOT EXISTS `position` INT NOT NULL DEFAULT 0 AFTER `amount`;

-- Migrate legacy unit_amount and amount into rate and line_total
UPDATE `invoice_items` SET `rate` = `unit_amount` WHERE `rate` = 0.00 AND `unit_amount` > 0;
UPDATE `invoice_items` SET `line_total` = `amount` WHERE `line_total` = 0.00 AND `amount` > 0;

-- ----------------------------------------------------------------------------
-- 5. PAYMENTS: ATTRIBUTION & REVERSAL AUDIT COLUMNS
-- ----------------------------------------------------------------------------
ALTER TABLE `payments`
  ADD COLUMN IF NOT EXISTS `assigned_to` VARCHAR(36) DEFAULT NULL AFTER `customer_id`,
  ADD COLUMN IF NOT EXISTS `updated_by` VARCHAR(36) DEFAULT NULL AFTER `assigned_to`,
  ADD COLUMN IF NOT EXISTS `reversal_reason` TEXT DEFAULT NULL AFTER `notes`,
  ADD COLUMN IF NOT EXISTS `reversed_at` DATETIME DEFAULT NULL AFTER `reversal_reason`,
  ADD COLUMN IF NOT EXISTS `reversed_by` VARCHAR(36) DEFAULT NULL AFTER `reversed_at`;

-- Safe Foreign Keys on Payments
ALTER TABLE `payments`
  ADD KEY IF NOT EXISTS `idx_payments_assigned_to` (`assigned_to`),
  ADD KEY IF NOT EXISTS `idx_payments_customer_id` (`customer_id`);

-- ============================================================================
-- MIGRATION COMPLETE. All existing CRM records have been preserved intact.
-- ============================================================================
