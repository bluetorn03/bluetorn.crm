import { toast } from "sonner";

/**
 * BLUETORN CRM — Safe Error Message Formatter
 *
 * Sanitizes errors before rendering in UI components or toasts.
 * Prevents raw HTML (such as Hostinger CDN / Cloudflare / WAF browser challenges
 * or Nginx error documents) and sensitive credentials from leaking into the UI.
 */

export function isCdnSecurityChallenge(error: unknown): boolean {
  if (!error) return false;
  const rawStr =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : String(error);

  return (
    rawStr.includes("hcdn-cgi") ||
    rawStr.includes("Checking your browser before accessing") ||
    rawStr.includes("cf-browser-verification") ||
    rawStr.includes("Just a moment...")
  );
}

export function formatErrorMessage(error: unknown, fallback = "An unexpected error occurred."): string {
  if (!error) return fallback;

  if (isCdnSecurityChallenge(error)) {
    return "Network security verification required by Hostinger CDN. Please refresh the page (F5) to complete the verification challenge.";
  }

  let rawMessage = "";
  if (error instanceof Error) {
    rawMessage = error.message;
  } else if (typeof error === "string") {
    rawMessage = error;
  } else if (typeof error === "object" && error !== null && "message" in error) {
    rawMessage = String((error as { message?: unknown }).message ?? "");
  } else {
    rawMessage = String(error);
  }

  if (!rawMessage || rawMessage.trim().length === 0) {
    return fallback;
  }

  // Detect generic HTML responses (e.g. 502/503/504 Bad Gateway, Nginx, or renderErrorPage)
  if (
    rawMessage.startsWith("<!DOCTYPE") ||
    rawMessage.startsWith("<!doctype") ||
    rawMessage.startsWith("<html") ||
    rawMessage.startsWith("<HTML") ||
    /<[a-z][\s\S]*>/i.test(rawMessage)
  ) {
    if (rawMessage.includes("This page didn't load")) {
      return "The server encountered a temporary error. Please try again or refresh the page.";
    }
    return "A temporary server or network error occurred. Please refresh the page or try again.";
  }

  // Redact potential secrets, passwords, or tokens if accidentally contained in error message
  let safe = rawMessage
    .replace(/(password|secret|token|session|cookie)=[^&\s]+/gi, "$1=[REDACTED]")
    .trim();

  // Guard against excessive message length in UI
  if (safe.length > 250) {
    safe = safe.slice(0, 247) + "…";
  }

  return safe || fallback;
}

export function safeToastError(
  error: unknown,
  fallback = "An unexpected error occurred.",
  options?: Parameters<typeof toast.error>[1]
) {
  const isChallenge = isCdnSecurityChallenge(error);
  const msg = formatErrorMessage(error, fallback);
  let finalOptions = options;
  if (isChallenge && (!finalOptions || !finalOptions.action)) {
    finalOptions = {
      ...finalOptions,
      action: {
        label: "Refresh",
        onClick: () => {
          if (typeof window !== "undefined") window.location.reload();
        },
      },
    };
  }
  return toast.error(msg, finalOptions);
}
