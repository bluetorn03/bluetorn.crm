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
 * Normalizes an IANA timezone string.
 * Falls back to "UTC" if timezone is missing, invalid, or unrecognized.
 */
export function normalizeTimeZone(tz?: string | null): string {
  if (!tz || typeof tz !== "string" || !tz.trim()) return "UTC";
  const trimmed = tz.trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return "UTC";
  }
}

/**
 * Parses any date input into a canonical UTC Date instance.
 * Handles MySQL DATETIME strings ("YYYY-MM-DD HH:mm:ss"), ISO strings, Date instances, and numeric timestamps.
 */
export function parseUtcDate(input: string | Date | number | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  let str = String(input).trim();
  if (!str) return null;
  // If MySQL DATETIME "YYYY-MM-DD HH:mm:ss" without trailing Z or offset, append Z for UTC interpretation
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
    str = str.replace(" ", "T") + "Z";
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Computes calendar day difference between target date and now in the specified timezone.
 * Returns 0 for Today, 1 for Yesterday, etc.
 */
export function getDaysDiffInTimezone(target: Date, now: Date, timeZone?: string | null): number {
  const tz = normalizeTimeZone(timeZone);
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

/** DD/MM/YYYY in workspace timezone (or local browser fallback if omitted) */
export function formatDate(iso?: string | null, timeZone?: string | null) {
  if (!iso) return "—";
  const d = parseUtcDate(iso);
  if (!d) return "—";
  if (timeZone) {
    const tz = normalizeTimeZone(timeZone);
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
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 12-hour clock, e.g. 04:30 PM in workspace timezone */
export function formatTime(iso: string, timeZone?: string | null) {
  const d = parseUtcDate(iso);
  if (!d) return "";
  if (timeZone) {
    const tz = normalizeTimeZone(timeZone);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  }
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${suffix}`;
}

export function formatDateTime(iso: string, timeZone?: string | null) {
  return `${formatDate(iso, timeZone)} · ${formatTime(iso, timeZone)}`;
}

export function relativeTime(iso: string, timeZone?: string | null) {
  const d = parseUtcDate(iso);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return mins <= 0 ? "just now" : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(iso, timeZone);
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

