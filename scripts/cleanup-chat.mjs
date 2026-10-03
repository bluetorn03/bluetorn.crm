/**
 * BLUETORN CRM — Standalone Chat & Retention Cleanup Runner (Backward-Compatible)
 *
 * Automatically delegates to the master centralized retention engine (chat, audit, notifications).
 *
 * Example Cron Configuration (every hour or daily):
 *   0 * * * * cd /home/u.../domains/realestate.bluetorn.com/public_html && node scripts/cleanup-chat.mjs >> /tmp/cleanup.log 2>&1
 */
import "./centralized-cleanup.mjs";
