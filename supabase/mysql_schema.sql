-- ============================================================================
-- BLUETORN CRM — PRODUCTION MYSQL SCHEMA (TARGET: HOSTINGER MYSQL)
-- Engine: InnoDB, Charset: utf8mb4 / utf8mb4_unicode_ci
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `bluetorn_crm` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `bluetorn_crm`;

-- ----------------------------------------------------------------------------
-- 1. WORKSPACES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workspaces` (
  `id` VARCHAR(36) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `legal_name` VARCHAR(255) DEFAULT NULL,
  `industry` VARCHAR(128) NOT NULL DEFAULT 'Real Estate',
  `plan` VARCHAR(64) NOT NULL DEFAULT 'Starter',
  `status` ENUM('active','trial','suspended','inactive') NOT NULL DEFAULT 'trial',
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  `date_format` VARCHAR(32) NOT NULL DEFAULT 'DD/MM/YYYY',
  `time_format` VARCHAR(16) NOT NULL DEFAULT '12h',
  `logo_url` TEXT DEFAULT NULL,
  `primary_color` VARCHAR(32) DEFAULT NULL,
  `contact_email` VARCHAR(255) DEFAULT NULL,
  `contact_phone` VARCHAR(64) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `seat_limit` INT NOT NULL DEFAULT 10,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workspaces_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. PROFILES (USERS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `profiles` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) DEFAULT NULL,
  `user_code` VARCHAR(64) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(64) DEFAULT NULL,
  `job_title` VARCHAR(128) DEFAULT NULL,
  `avatar_url` TEXT DEFAULT NULL,
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_profiles_ws_user_code` (`workspace_id`, `user_code`),
  CONSTRAINT `fk_profiles_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. USER ROLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) DEFAULT NULL,
  `role` ENUM('super_admin','owner','manager','employee') NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`user_id`, `workspace_id`, `role`),
  CONSTRAINT `fk_roles_user` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_roles_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. CUSTOMERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(64) DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `type` VARCHAR(64) NOT NULL DEFAULT 'Buyer',
  `status` VARCHAR(64) NOT NULL DEFAULT 'Prospect',
  `city` VARCHAR(128) DEFAULT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `value` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tags` JSON DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `assigned_to` VARCHAR(36) DEFAULT NULL,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customers_ws` (`workspace_id`),
  CONSTRAINT `fk_customers_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_customers_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. PROPERTIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `properties` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255) DEFAULT NULL,
  `type` VARCHAR(64) NOT NULL DEFAULT 'Apartment',
  `status` VARCHAR(64) NOT NULL DEFAULT 'Available',
  `price` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `bedrooms` INT DEFAULT NULL,
  `area_sqft` INT DEFAULT NULL,
  `image_url` TEXT DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `assigned_to` VARCHAR(36) DEFAULT NULL,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_properties_ws` (`workspace_id`),
  CONSTRAINT `fk_properties_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. LEADS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leads` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(64) DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `source` VARCHAR(64) NOT NULL DEFAULT 'Manual Entry',
  `campaign` VARCHAR(128) DEFAULT NULL,
  `external_id` VARCHAR(128) DEFAULT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'New',
  `requirement` TEXT DEFAULT NULL,
  `budget` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `score` INT NOT NULL DEFAULT 50,
  `next_follow_up` DATETIME DEFAULT NULL,
  `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assigned_to` VARCHAR(36) DEFAULT NULL,
  `property_id` VARCHAR(36) DEFAULT NULL,
  `customer_id` VARCHAR(36) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leads_ws` (`workspace_id`),
  KEY `idx_leads_assigned` (`assigned_to`),
  CONSTRAINT `fk_leads_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leads_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_leads_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. LEAD ACTIVITIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lead_activities` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `lead_id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `note` TEXT DEFAULT NULL,
  `actor_id` VARCHAR(36) DEFAULT NULL,
  `actor_label` VARCHAR(128) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead_act_lead` (`lead_id`),
  CONSTRAINT `fk_activities_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. TASKS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `due_at` DATETIME DEFAULT NULL,
  `priority` VARCHAR(32) NOT NULL DEFAULT 'Medium',
  `status` VARCHAR(32) NOT NULL DEFAULT 'Open',
  `assigned_to` VARCHAR(36) DEFAULT NULL,
  `lead_id` VARCHAR(36) DEFAULT NULL,
  `customer_id` VARCHAR(36) DEFAULT NULL,
  `property_id` VARCHAR(36) DEFAULT NULL,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tasks_ws` (`workspace_id`),
  CONSTRAINT `fk_tasks_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. CALENDAR EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `calendar_events` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `type` VARCHAR(64) NOT NULL DEFAULT 'Meeting',
  `status` VARCHAR(32) NOT NULL DEFAULT 'Scheduled',
  `start_at` DATETIME NOT NULL,
  `end_at` DATETIME DEFAULT NULL,
  `location` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `lead_id` VARCHAR(36) DEFAULT NULL,
  `customer_id` VARCHAR(36) DEFAULT NULL,
  `property_id` VARCHAR(36) DEFAULT NULL,
  `assigned_to` VARCHAR(36) DEFAULT NULL,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_events_ws` (`workspace_id`),
  CONSTRAINT `fk_events_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. INVOICES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `invoice_number` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(36) DEFAULT NULL,
  `property_id` VARCHAR(36) DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'Draft',
  `issue_date` DATE NOT NULL,
  `due_date` DATE DEFAULT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `tax_rate` DECIMAL(6,3) NOT NULL DEFAULT 0.000,
  `subtotal` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT DEFAULT NULL,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invoices_ws_number` (`workspace_id`, `invoice_number`),
  CONSTRAINT `fk_invoices_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. INVOICE ITEMS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `invoice_id` VARCHAR(36) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1.00,
  `unit_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_items_invoice` (`invoice_id`),
  CONSTRAINT `fk_items_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. PAYMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) NOT NULL,
  `invoice_id` VARCHAR(36) DEFAULT NULL,
  `customer_id` VARCHAR(36) DEFAULT NULL,
  `amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `method` VARCHAR(64) NOT NULL DEFAULT 'Bank Transfer',
  `status` VARCHAR(32) NOT NULL DEFAULT 'Received',
  `paid_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reference` VARCHAR(128) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_by` VARCHAR(36) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payments_ws` (`workspace_id`),
  CONSTRAINT `fk_payments_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. PLANS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `plans` (
  `id` VARCHAR(36) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `price_monthly` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `seat_limit` INT NOT NULL DEFAULT 10,
  `features` JSON DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plans_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. PROMOTIONAL MEDIA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `promo_media` (
  `id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT DEFAULT NULL,
  `image_url` TEXT DEFAULT NULL,
  `target` VARCHAR(128) NOT NULL DEFAULT 'All workspaces',
  `priority` INT NOT NULL DEFAULT 1,
  `start_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_at` DATETIME DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. PLATFORM SETTINGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `platform_settings` (
  `key` VARCHAR(128) NOT NULL,
  `value` JSON NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` VARCHAR(36) DEFAULT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(36) NOT NULL,
  `workspace_id` VARCHAR(36) DEFAULT NULL,
  `actor_id` VARCHAR(36) DEFAULT NULL,
  `actor_label` VARCHAR(128) DEFAULT NULL,
  `action` VARCHAR(128) NOT NULL,
  `entity_type` VARCHAR(64) DEFAULT NULL,
  `entity_id` VARCHAR(64) DEFAULT NULL,
  `metadata` JSON DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_ws_created` (`workspace_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
