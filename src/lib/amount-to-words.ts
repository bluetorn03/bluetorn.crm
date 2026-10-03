/**
 * BLUETORN CRM — Amount In Words Utility (Indian Numbering & Multi-Currency)
 *
 * Provides deterministic, currency-aware, and Indian numbering conversion
 * (Crore, Lakh, Thousand, Hundred) for invoices, payments, and client financial records.
 *
 * Examples (INR):
 *   1000       -> "Rupees One Thousand Only"
 *   100000     -> "Rupees One Lakh Only"
 *   1000000    -> "Rupees Ten Lakh Only"
 *   10000000   -> "Rupees One Crore Only"
 *   1000000.50 -> "Rupees Ten Lakh and Fifty Paise Only"
 *   0          -> "Rupees Zero Only"
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

interface CurrencyUnit {
  main: string;
  sub: string;
  prefix: string; // e.g. "Rupees "
}

const CURRENCY_CONFIG: Record<string, CurrencyUnit> = {
  INR: { main: "Rupees", sub: "Paise", prefix: "Rupees" },
  USD: { main: "US Dollars", sub: "Cents", prefix: "US Dollars" },
  EUR: { main: "Euros", sub: "Cents", prefix: "Euros" },
  AED: { main: "UAE Dirhams", sub: "Fils", prefix: "UAE Dirhams" },
  GBP: { main: "British Pounds", sub: "Pence", prefix: "British Pounds" },
};

/** Convert 1–99 to words */
function convertBelowHundred(n: number): string {
  if (n < 20) return ONES[n] || "";
  const ten = Math.floor(n / 10);
  const rem = n % 10;
  return rem ? `${TENS[ten]} ${ONES[rem]}` : TENS[ten] || "";
}

/** Convert 1–999 to words */
function convertBelowThousand(n: number): string {
  const hundred = Math.floor(n / 100);
  const rem = n % 100;
  if (!hundred) return convertBelowHundred(rem);
  if (!rem) return `${ONES[hundred]} Hundred`;
  return `${ONES[hundred]} Hundred ${convertBelowHundred(rem)}`;
}

/**
 * Convert integer to Indian numbering format (Crore, Lakh, Thousand, Hundred).
 */
export function integerToIndianWords(num: number | bigint): string {
  let n = typeof num === "bigint" ? Number(num) : Math.floor(Math.abs(num));
  if (n === 0) return "Zero";

  const parts: string[] = [];

  // Crores (>= 1,00,00,000)
  if (n >= 10000000) {
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    // Recursively handle multi-crore amounts (e.g. 120 Crore)
    parts.push(`${integerToIndianWords(crore)} Crore`);
  }

  // Lakhs (>= 1,00,000)
  if (n >= 100000) {
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    parts.push(`${convertBelowHundred(lakh)} Lakh`);
  }

  // Thousands (>= 1,000)
  if (n >= 1000) {
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    parts.push(`${convertBelowHundred(thousand)} Thousand`);
  }

  // Hundreds & Below (< 1,000)
  if (n > 0) {
    parts.push(convertBelowThousand(n));
  }

  return parts.join(" ").trim();
}

/**
 * Derives amount in words dynamically from numeric amount + currency.
 * Single source of truth is the numeric amount.
 *
 * @param amount - The numeric value (can be decimal)
 * @param currency - Currency code (e.g. "INR", "USD", "EUR", "AED")
 * @returns Fully formatted words string, e.g. "Rupees Ten Lakh and Fifty Paise Only"
 */
export function amountToWords(
  amount: number | string | null | undefined,
  currency: string = "INR",
): string {
  if (amount == null || amount === "") {
    return "";
  }

  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    return "";
  }

  const cfg = CURRENCY_CONFIG[currency.toUpperCase()] ?? {
    main: `${currency} Units`,
    sub: "Subunits",
    prefix: currency,
  };

  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const intPart = Math.floor(absNum);
  const decPart = Math.round((absNum - intPart) * 100);

  // Pure zero
  if (intPart === 0 && decPart === 0) {
    return `${cfg.prefix} Zero Only`;
  }

  const parts: string[] = [];

  if (isNegative) {
    parts.push("Negative");
  }

  // Handle main units
  if (intPart > 0) {
    parts.push(cfg.prefix);
    parts.push(integerToIndianWords(intPart));
  }

  // Handle fractional sub-units (e.g. Paise, Cents)
  if (decPart > 0) {
    const subWords = convertBelowHundred(decPart);
    if (intPart > 0) {
      parts.push(`and ${subWords} ${cfg.sub}`);
    } else {
      parts.push(`${subWords} ${cfg.sub}`);
    }
  }

  parts.push("Only");

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
