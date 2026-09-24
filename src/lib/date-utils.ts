/**
 * Date & Time utility functions for BLUETORN CRM task due date/time handling.
 * Ensures consistent YYYY-MM-DDTHH:mm local formatting, ISO UTC conversions,
 * zero timezone drift, and robust application-level validation.
 */

const DATETIME_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Pads a number with leading zeroes to 2 digits.
 */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Converts an ISO timestamp string (e.g. "2026-08-24T10:00:00.000Z")
 * into a local "YYYY-MM-DDTHH:mm" format string compatible with HTML datetime-local inputs.
 * Uses local time methods (getFullYear, getMonth, getDate, getHours, getMinutes) to represent
 * the exact local time in the user's browser timezone.
 */
export function formatDateTimeLocal(isoString?: string | null): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converts a local "YYYY-MM-DDTHH:mm" datetime-local string back to an ISO 8601 UTC string.
 * Native `new Date("YYYY-MM-DDTHH:mm")` parses local time in JavaScript browsers.
 * Returns ISO UTC string (e.g. "2026-08-24T04:30:00.000Z") or null if invalid/empty.
 */
export function parseDateTimeLocal(dateTimeLocalStr?: string | null): string | null {
  if (!dateTimeLocalStr || typeof dateTimeLocalStr !== "string") return null;
  const trimmed = dateTimeLocalStr.trim();
  if (!trimmed) return null;

  if (!DATETIME_LOCAL_REGEX.test(trimmed)) return null;

  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return null;

  return date.toISOString();
}

/**
 * Validates a datetime-local input value.
 * Checks for non-empty, complete format, and valid JavaScript Date representation.
 */
export function validateDueDateTime(
  dateTimeLocalStr?: string | null,
  required = true,
): { isValid: boolean; error?: string } {
  if (!dateTimeLocalStr || !dateTimeLocalStr.trim()) {
    if (required) {
      return { isValid: false, error: "Please select a valid due date and time." };
    }
    return { isValid: true };
  }

  const parsed = parseDateTimeLocal(dateTimeLocalStr);
  if (!parsed) {
    return { isValid: false, error: "Please select a valid due date and time." };
  }

  return { isValid: true };
}

/**
 * Returns a default, valid usable "YYYY-MM-DDTHH:mm" local datetime string for creating new tasks.
 * Defaults to the top of the next hour today (or next day if late).
 */
export function getDefaultDueDateTime(): string {
  const now = new Date();
  // Set to next hour 00:00
  now.setHours(now.getHours() + 1, 0, 0, 0);
  return formatDateTimeLocal(now.toISOString());
}

/**
 * Returns an ISO timestamp string for the next day at 10:00 AM local time.
 * Used to give quick add tasks an automatic default due date for calendar inclusion.
 */
export function getDefaultQuickAddDueDateTime(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  return tomorrow.toISOString();
}

/**
 * Returns true if the given due date/time is in the past and the item
 * is not in a terminal status (Completed / Cancelled).
 */
export function isOverdue(dueAt: string | null | undefined, status: string): boolean {
  if (!dueAt) return false;
  const terminal = ["Completed", "Cancelled", "Paid", "No Show"];
  if (terminal.includes(status)) return false;
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

/**
 * Returns the number of full calendar days an item is overdue.
 * Returns 0 if the item is not overdue or the date is invalid.
 */
export function getOverdueDays(dueAt: string | null | undefined): number {
  if (!dueAt) return 0;
  const due = new Date(dueAt);
  if (isNaN(due.getTime())) return 0;
  const now = new Date();
  // Compare at day-level precision
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - dueDay.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formats overdue duration as "Overdue by X day(s)".
 */
export function formatOverdueDuration(dueAt: string | null | undefined): string {
  const days = getOverdueDays(dueAt);
  if (days <= 0) return "";
  return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
}
