import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

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

/* --------------------------------------------------------------------------- */

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Serve uploaded images (property photos, workspace logos)
    // Public endpoints — URLs are UUID-based and unguessable.
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/uploads/")) {
      const uploadResponse = await serveUploadedFile(url.pathname);
      if (uploadResponse) return uploadResponse;
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
