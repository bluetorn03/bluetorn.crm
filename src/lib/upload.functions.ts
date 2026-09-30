/**
 * BLUETORN CRM — Image Upload Server Functions.
 *
 * Handles authenticated image uploads and deletions for:
 * - Property images
 * - Workspace company logos
 *
 * Storage: Persistent filesystem at data/uploads/{workspaceId}/{uuid}.{ext}
 * Serving: Via /api/uploads/{workspaceId}/{filename} route in server.ts
 *
 * Server-side only handler code. Client components import the exported
 * createServerFn references for RPC calls.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth } from "./auth-server";

/* -------------------------------- constants -------------------------------- */

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/* ------------------------------ magic-byte check --------------------------- */

function detectMimeFromBytes(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";

  // WebP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";

  return null;
}

/* --------------------------------- upload ---------------------------------- */

export const uploadImageFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: { workspaceId: string; base64Data: string; filename: string; mimeType: string }) => {
      if (!input.base64Data) throw new Error("No image data provided.");
      if (!input.filename) throw new Error("No filename provided.");
      if (!input.mimeType) throw new Error("No MIME type provided.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    // Dynamic imports — only resolved server-side
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { uuid } = await import("./db");

    // 1. Workspace authorization
    if (context.role !== "super_admin" && context.workspaceId !== data.workspaceId) {
      throw new Error("FORBIDDEN: Cross-workspace upload denied.");
    }

    // 2. Validate declared MIME
    if (!ALLOWED_MIMES.has(data.mimeType.toLowerCase())) {
      throw new Error(`Invalid file type: ${data.mimeType}. Allowed: JPG, PNG, WEBP.`);
    }

    // 3. Validate extension
    const ext = path.extname(data.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`Invalid file extension: ${ext}. Allowed: .jpg, .jpeg, .png, .webp.`);
    }

    // 4. Decode base64 and validate size
    const buffer = Buffer.from(data.base64Data, "base64");
    if (buffer.length === 0) throw new Error("Empty file.");
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum: 5 MB.`,
      );
    }

    // 5. Magic-byte verification (prevent MIME spoofing)
    const actualMime = detectMimeFromBytes(buffer);
    if (!actualMime || !ALLOWED_MIMES.has(actualMime)) {
      throw new Error(
        "File content does not match a supported image format (MIME spoofing blocked).",
      );
    }

    // 6. Generate safe filename
    const safeFilename = `${uuid()}${ext}`;
    const uploadDir = process.env["UPLOAD_DIR"] || path.join(process.cwd(), "data", "uploads");
    const wsDir = path.join(uploadDir, data.workspaceId);

    // 7. Ensure directory exists
    await fs.mkdir(wsDir, { recursive: true });

    // 8. Write file
    await fs.writeFile(path.join(wsDir, safeFilename), buffer);

    // 9. Return permanent URL
    return { url: `/api/uploads/${data.workspaceId}/${safeFilename}` };
  });

/* --------------------------------- delete ---------------------------------- */

export const deleteUploadedImageFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; url: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    // Workspace authorization
    if (context.role !== "super_admin" && context.workspaceId !== data.workspaceId) {
      throw new Error("FORBIDDEN: Cross-workspace delete denied.");
    }

    // Only delete files from our upload directory
    const prefix = `/api/uploads/${data.workspaceId}/`;
    if (!data.url.startsWith(prefix)) {
      return { ok: true }; // External URL — nothing to delete
    }

    const filename = data.url.slice(prefix.length);

    // Path traversal protection
    if (/[/\\]|\.\./.test(filename)) {
      throw new Error("Invalid filename.");
    }

    const uploadDir = process.env["UPLOAD_DIR"] || path.join(process.cwd(), "data", "uploads");
    const filePath = path.join(uploadDir, data.workspaceId, filename);

    try {
      await fs.unlink(filePath);
    } catch {
      // File missing is OK (idempotent delete)
    }

    return { ok: true };
  });
