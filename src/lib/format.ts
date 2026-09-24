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

/** DD/MM/YYYY */
export function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 12-hour clock, e.g. 04:30 PM */
export function formatTime(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${suffix}`;
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return mins <= 0 ? "just now" : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}
