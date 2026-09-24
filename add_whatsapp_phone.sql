-- BLUETORN CRM — Migration: Add WhatsApp phone to profiles
-- Safe, non-breaking ALTER TABLE — adds nullable column with no default data impact.
-- Run this on the production Hostinger MySQL database.

ALTER TABLE `profiles`
  ADD COLUMN `whatsapp_phone` VARCHAR(64) DEFAULT NULL AFTER `phone`;
