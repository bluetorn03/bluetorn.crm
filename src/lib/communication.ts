/**
 * BLUETORN CRM — Communication Helper Utilities
 * Safe phone normalization, Gmail compose URL generation, device detection.
 */

/**
 * Normalizes a phone number string for standard tel: URIs.
 * Preserves leading '+' for country code when present.
 * Strips spaces, brackets, hyphens, and other invalid characters.
 * Example: "+91 99676 79967" -> "+919967679967"
 * Example: "(022) 2600-1234" -> "02226001234"
 */
export function normalizePhoneForTel(phone?: string | null): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Checks if the current browser environment is a mobile device.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  return isMobileUA || (isSmallScreen && hasTouch);
}

/**
 * Generates a Gmail web compose URL for the specified recipient, subject, and body.
 */
export function getGmailComposeUrl(recipient: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: recipient.trim(),
    su: subject,
    body: body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * Generates a mailto: URL as a universal email client action.
 * Encodes spaces as %20 and line breaks as %0A for maximum email client compatibility.
 */
export function getMailtoUrl(recipient: string, subject: string, body: string): string {
  const cleanRecipient = recipient.trim();
  const queryParts: string[] = [];
  if (subject) {
    queryParts.push(`subject=${encodeURIComponent(subject)}`);
  }
  if (body) {
    queryParts.push(`body=${encodeURIComponent(body)}`);
  }
  return `mailto:${cleanRecipient}${queryParts.length > 0 ? `?${queryParts.join("&")}` : ""}`;
}

/**
 * Default CRM follow-up subject & body templates.
 */
export function createLeadEmailTemplate(leadName: string, senderName?: string, workspaceName?: string) {
  const name = leadName.trim() || "Client";
  const sender = senderName?.trim() || workspaceName || "Bluetorn CRM";
  
  const subject = `Follow-up regarding your property requirement`;
  const body = `Hello ${name},\n\nI'm following up regarding your property requirement. Please let me know a convenient time to discuss the available options.\n\nRegards,\n${sender}`;

  return { subject, body };
}

/**
 * Normalizes phone number and returns a direct WhatsApp web/api link.
 * Handles Indian numbers without country code (10 digits -> prefixed with 91).
 */
export function formatWhatsAppUrl(phone?: string | null, message?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return null;

  let waPhone = digits;
  if (digits.length === 10) {
    waPhone = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    waPhone = `91${digits.slice(1)}`;
  }

  const encodedMsg = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${waPhone}${encodedMsg}`;
}
