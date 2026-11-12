import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { validateSessionSecretConfig } from "./lib/auth-server";

// Startup validation: In production, fail early and cleanly if SESSION_SECRET is missing or weak
const authValidation = validateSessionSecretConfig();
if (!authValidation.ok) {
  console.error(`[FATAL STARTUP] ${authValidation.error}`);
  if (typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production") {
    throw new Error(`[FATAL STARTUP] ${authValidation.error}`);
  }
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/* ---------- Uploaded-image serving (/api/uploads/{wsId}/{filename}) --------- */

const UPLOAD_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function serveUploadedFile(pathname: string): Promise<Response | null> {
  // Expected: /api/uploads/{workspaceId}/{uuid.ext}
  const trimmed = pathname.replace("/api/uploads/", "");
  const slash = trimmed.indexOf("/");
  if (slash < 1) return null;

  const workspaceId = trimmed.slice(0, slash);
  const filename = trimmed.slice(slash + 1);

  // Security: no path traversal, no nested paths, no empty segments
  if (
    !filename ||
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    !workspaceId ||
    workspaceId.includes("..")
  ) {
    return new Response("Bad request", { status: 400 });
  }

  const path = await import("node:path");
  const ext = path.extname(filename).toLowerCase();
  const mime = UPLOAD_MIME[ext];
  if (!mime) return new Response("Unsupported type", { status: 400 });

  const uploadDir = process.env["UPLOAD_DIR"] || path.join(process.cwd(), "data", "uploads");
  const filePath = path.join(uploadDir, workspaceId, filename);

  try {
    const fs = await import("node:fs/promises");
    const data = await fs.readFile(filePath);
    return new Response(data, {
      headers: {
        "content-type": mime,
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(data.length),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/* ----------------- Scheduled Chat Message Retention Cleanup ---------------- */

let _cleanupIntervalStarted = false;

function ensureChatCleanupJob(): void {
  if (_cleanupIntervalStarted) return;
  _cleanupIntervalStarted = true;

  // Run initial cleanup after 15 seconds, then every 30 minutes
  setTimeout(async () => {
    try {
      const { cleanupExpiredChatMessages } = await import("./lib/chat-cleanup");
      await cleanupExpiredChatMessages();
    } catch (err) {
      console.error("[Server Chat Cleanup] Initial run error:", err);
    }
  }, 15000);

  setInterval(
    async () => {
      try {
        const { cleanupExpiredChatMessages } = await import("./lib/chat-cleanup");
        await cleanupExpiredChatMessages();
      } catch (err) {
        console.error("[Server Chat Cleanup] Interval run error:", err);
      }
    },
    30 * 60 * 1000,
  );
}

// Start background interval on server load
ensureChatCleanupJob();

/* --------------------------------------------------------------------------- */

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    ensureChatCleanupJob();

    const url = new URL(request.url);

    // Serve uploaded images (property photos, workspace logos)
    // Public endpoints — URLs are UUID-based and unguessable.
    if (url.pathname.startsWith("/api/uploads/")) {
      const uploadResponse = await serveUploadedFile(url.pathname);
      if (uploadResponse) return uploadResponse;
    }

    // Cron endpoint for Hostinger / external webhook triggers
    if (url.pathname === "/api/cron/cleanup-chat") {
      try {
        const { cleanupExpiredChatMessages } = await import("./lib/chat-cleanup");
        const result = await cleanupExpiredChatMessages();
        return new Response(JSON.stringify({ success: true, ...result }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error("[Server Catch-All Error]", error);
      const accept = request.headers.get("accept") ?? "";
      // Only return HTML renderErrorPage for direct browser HTML page loads
      if (accept.includes("text/html") && !url.pathname.startsWith("/_server")) {
        return new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Internal server error",
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
  },
};
