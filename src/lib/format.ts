export const CURRENCIES = {
  INR: { code: "INR", symbol: "₹", locale: "en-IN" },
  USD: { code: "USD", symbol: "$", locale: "en-US" },
  AED: { code: "AED", symbol: "AED ", locale: "en-AE" },
  EUR: { code: "EUR", symbol: "€", locale: "de-DE" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export function formatMoney(amount: number, currency: CurrencyCode = "INR", compact = false) {
  const c = CURRENCIES[currency];
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.code,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(amount);
}

/**
 * Formats a raw number or numeric string using the Indian numbering system:
 * 1000       -> "1,000"
 * 100000     -> "1,00,000"
 * 1000000    -> "10,00,000"
 * 10000000   -> "1,00,00,000"
 * Preserves decimals if present and enabled.
 */
export function formatIndianNumber(
  val: string | number | null | undefined,
  allowDecimals = false,
): string {
  if (val == null || val === "") return "";
  const raw = String(val).trim();
  if (!raw) return "";

  // Split into integer and decimal parts
  const hasDecimal = raw.includes(".");
  const parts = raw.split(".");
  let intPart = (parts[0] ?? "").replace(/\D/g, "");

  // Prevent multiple leading zeroes
  if (intPart.length > 1 && intPart.startsWith("0")) {
    intPart = intPart.replace(/^0+/, "") || "0";
  }

  let formattedInt = "";
  if (intPart.length <= 3) {
    formattedInt = intPart;
  } else {
    const lastThree = intPart.substring(intPart.length - 3);
    const otherDigits = intPart.substring(0, intPart.length - 3);
    const withCommas = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    formattedInt = `${withCommas},${lastThree}`;
  }

  if (allowDecimals && hasDecimal) {
    const decPart = (parts[1] ?? "").replace(/\D/g, "").slice(0, 2);
    return `${formattedInt}.${decPart}`;
  }

  return formattedInt;
}

/**
 * Parses an Indian or standard comma-formatted string back into a raw numeric value.
 * e.g. "1,00,00,000" -> 10000000
 * e.g. "1,00,000.50" -> 100000.5
 */
export function parseIndianNumber(val: string | number | null | undefined): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Normalizes an IANA timezone string.
 * Defaults to 'UTC' if invalid or empty.
 */
export function normalizeTimeZone(tz?: string | null, fallback = "UTC"): string {
  if (!tz || typeof tz !== "string" || !tz.trim()) return fallback;
  const trimmed = tz.trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return fallback;
  }
}

/**
 * Parses any database or API timestamp input into a canonical UTC Date instance.
 * Handles:
 * - MySQL DATETIME strings ("YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD HH:mm:ss.SSS")
 * - ISO 8601 strings (with or without 'Z')
 * - Date instances
 * - Numeric millisecond timestamps
 * 
 * Guarantees zero browser-local timezone drift when reading UTC timestamps.
 */
export function parseDbUtcTimestamp(input: string | Date | number | null | undefined): Date | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  let str = String(input).trim();
  if (!str) return null;

  // MySQL DATETIME: "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm:ss.SSS"
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str.replace(" ", "T") + "Z";
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    // Pure date "YYYY-MM-DD", treat as UTC midnight
    str = `${str}T00:00:00Z`;
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Backward-compatible alias for parseDbUtcTimestamp.
 */
export const parseUtcDate = parseDbUtcTimestamp;

/**
 * Computes calendar day difference between target date and now in the specified timezone.
 * Returns 0 for Today, 1 for Yesterday, etc.
 */
export function getDaysDiffInTimezone(target: Date, now: Date, timeZone?: string | null): number {
  const tz = normalizeTimeZone(timeZone || IST_TIMEZONE, IST_TIMEZONE);
  const getMidnight = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(d);
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    const y = parts.find((p) => p.type === "year")?.value;
    return Date.UTC(Number(y), Number(m) - 1, Number(day));
  };
  return Math.round((getMidnight(now) - getMidnight(target)) / 86400000);
}

/** DD/MM/YYYY in workspace timezone (defaults to Asia/Kolkata IST) */
export function formatDate(iso?: string | Date | number | null, timeZone?: string | null) {
  if (!iso) return "—";
  const d = parseDbUtcTimestamp(iso);
  if (!d) return "—";
  const tz = normalizeTimeZone(timeZone || IST_TIMEZONE, IST_TIMEZONE);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return `${day}/${month}/${year}`;
}

/** 12-hour clock, e.g. 04:30 PM in workspace timezone (defaults to Asia/Kolkata IST) */
export function formatTime(iso: string | Date | number, timeZone?: string | null) {
  const d = parseDbUtcTimestamp(iso);
  if (!d) return "";
  const tz = normalizeTimeZone(timeZone || IST_TIMEZONE, IST_TIMEZONE);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Formats date & time as DD/MM/YYYY • hh:mm AM/PM (defaults to Asia/Kolkata IST) */
export function formatDateTime(iso: string | Date | number, timeZone?: string | null) {
  const d = parseDbUtcTimestamp(iso);
  if (!d) return "—";
  return `${formatDate(d, timeZone)} • ${formatTime(d, timeZone)}`;
}

/**
 * Returns human-friendly relative time calculated strictly from the actual event timestamp.
 * - 0–59 seconds: "just now"
 * - 1–59 minutes: "2m ago"
 * - 1–23 hours: "1h ago"
 * - 1+ days: "1d ago"
 * Future timestamps (genuine clock skew):
 * - < 60s future: "just now" (clock skew tolerance)
 * - 1–59 minutes future: "in 2m"
 * - 1–23 hours future: "in 1h"
 * - 1+ days future: "in 1d"
 * 
 * Never hides parsing errors with "just now".
 * Never uses static strings.
 */
export function relativeTime(
  iso: string | Date | number | null | undefined,
  baseNow = Date.now(),
): string {
  if (iso == null || iso === "") return "—";
  const d = parseDbUtcTimestamp(iso);
  if (!d) return "—";

  const diff = baseNow - d.getTime();

  // Future timestamps (skew or future scheduled events)
  if (diff < 0) {
    const futureMs = Math.abs(diff);
    if (futureMs < 60000) return "just now";
    const futureMins = Math.floor(futureMs / 60000);
    if (futureMins < 60) return `in ${futureMins}m`;
    const futureHrs = Math.floor(futureMs / 3600000);
    if (futureHrs < 24) return `in ${futureHrs}h`;
    const futureDays = Math.floor(futureMs / 86400000);
    return `in ${futureDays}d`;
  }

  // Past timestamps
  if (diff < 60000) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

/* -------------------------- Indian Standard Time (IST) -------------------- */

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Formats user-facing audit timestamps strictly in Indian Standard Time (Asia/Kolkata).
 * Format: DD/MM/YYYY • hh:mm AM/PM (e.g. 05/10/2026 • 12:57 AM)
 */
export function formatAuditTimestamp(iso: string | Date | number | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = parseDbUtcTimestamp(iso);
  if (!d) return "—";

  const dParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);

  const tParts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const day = dParts.find((p) => p.type === "day")?.value ?? "01";
  const month = dParts.find((p) => p.type === "month")?.value ?? "01";
  const year = dParts.find((p) => p.type === "year")?.value ?? "1970";

  const hour = tParts.find((p) => p.type === "hour")?.value ?? "12";
  const minute = tParts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (tParts.find((p) => p.type === "dayPeriod")?.value ?? "AM").toUpperCase();

  return `${day}/${month}/${year} • ${hour}:${minute} ${dayPeriod}`;
}

/**
 * Returns a concise relative time string calculated from the actual event timestamp.
 * Adheres strictly to the centralized relative-time standard.
 */
export function formatAuditRelativeTime(
  iso: string | Date | number | null | undefined,
  baseNow = Date.now(),
): string {
  return relativeTime(iso, baseNow);
}

/**
 * Formats notification timestamps into concise, real-time relative display strings:
 * - < 1 minute (or slight future clock skew < 60s): "now"
 * - 1–59 minutes: "Xm" (e.g. "2m", "27m", "38m")
 * - 1–23 hours: "Xh" (e.g. "1h", "5h")
 * - 1+ days: "Xd" (e.g. "1d", "3d")
 *
 * Never displays "ago", "in", "in 5h", etc.
 * Uses parseDbUtcTimestamp() for strict zero-drift UTC parsing.
 */
export function formatNotificationTime(
  iso: string | Date | number | null | undefined,
  baseNow = Date.now(),
): string {
  if (iso == null || iso === "") return "—";
  const d = parseDbUtcTimestamp(iso);
  if (!d) return "—";

  const diffMs = baseNow - d.getTime();

  // Handle future timestamps (slight clock skew or skew tolerance displays "now")
  if (diffMs < 0) {
    return "now";
  }

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) {
    return "now";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return `${diffHr}h`;
  }

  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d`;
}

/**
 * Converts an IST date string (YYYY-MM-DD or DD/MM/YYYY) into a UTC SQL DATETIME string
 * representing the start (00:00:00 IST) or end (23:59:59.999 IST) of that day.
 * IST is UTC+05:30.
 *
 * Examples:
 * 01/10/2026 From (isEnd = false) -> 2026-09-30 18:30:00 UTC
 * 01/10/2026 To   (isEnd = true)  -> 2026-10-01 18:29:59.999 UTC
 */
export function convertIstDateToUtcBounds(dateStr: string, isEnd = false): string {
  if (!dateStr || typeof dateStr !== "string") {
    return isEnd ? "9999-12-31 23:59:59.999" : "1970-01-01 00:00:00";
  }
  const clean = dateStr.trim();
  let year: number;
  let month: number;
  let day: number;

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(clean)) {
    const parts = clean.split(/[-/]/).map(Number);
    year = parts[0] ?? 1970;
    month = (parts[1] ?? 1) - 1;
    day = parts[2] ?? 1;
  } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/).map(Number);
    const p0 = parts[0] ?? 1;
    const p1 = parts[1] ?? 1;
    const p2 = parts[2] ?? 1970;
    // In India and CRM standard, DD/MM/YYYY is strictly day first
    day = p0;
    month = p1 - 1;
    year = p2;
  } else {
    const parsed = new Date(clean);
    if (isNaN(parsed.getTime())) {
      return isEnd ? "9999-12-31 23:59:59.999" : "1970-01-01 00:00:00";
    }
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth();
    day = parsed.getUTCDate();
  }

  // Construct UTC timestamp by subtracting 5h 30m (330 minutes = 19,800,000 ms) from IST midnight / end of day
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istLocalUtc = isEnd
    ? Date.UTC(year, month, day, 23, 59, 59, 999)
    : Date.UTC(year, month, day, 0, 0, 0, 0);

  const targetUtcDate = new Date(istLocalUtc - istOffsetMs);
  if (isEnd) {
    return targetUtcDate.toISOString().slice(0, 23).replace("T", " ");
  }
  return targetUtcDate.toISOString().slice(0, 19).replace("T", " ");
}

/* ----------------------------- chat formatting ---------------------------- */

/**
 * Message bubble timestamp: e.g. "10:45 AM" or "2:41 AM" in workspace timezone.
 */
export function formatChatMessageTime(
  dateInput: string | Date | null | undefined,
  timeZone?: string | null,
): string {
  const d = parseUtcDate(dateInput);
  if (!d) return "";
  const tz = normalizeTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Conversation list item last message time:
 * - "now" (< 1m)
 * - "3m" (< 60m)
 * - "2h" (same day in workspace timezone)
 * - "Yesterday" (yesterday in workspace timezone)
 * - "3d" (< 7d)
 * - "28 Sep" (older)
 */
export function formatChatLastMessageTime(
  dateInput: string | Date | null | undefined,
  timeZone?: string | null,
): string {
  const d = parseUtcDate(dateInput);
  if (!d) return "";
  const tz = normalizeTimeZone(timeZone);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60 && diffSec >= -10) return "now";
  if (diffMin < 60 && diffMin >= 0) return `${diffMin}m`;

  const diffDays = getDaysDiffInTimezone(d, now, tz);
  if (diffDays === 0) {
    if (diffHr < 24 && diffHr >= 0) return `${diffHr}h`;
    return formatChatMessageTime(d, tz);
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays}d`;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * Chat date divider header:
 * - "Today" (today in workspace timezone)
 * - "Yesterday" (yesterday in workspace timezone)
 * - "Oct 1, 2026" (other dates in workspace timezone)
 */
export function formatChatDateDivider(
  dateInput: string | Date | null | undefined,
  timeZone?: string | null,
): string {
  const d = parseUtcDate(dateInput);
  if (!d) return "";
  const tz = normalizeTimeZone(timeZone);
  const now = new Date();
  const diffDays = getDaysDiffInTimezone(d, now, tz);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

