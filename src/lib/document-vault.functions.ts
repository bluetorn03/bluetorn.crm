/**
 * BLUETORN CRM — Document Vault Server Functions
 *
 * Secure storage, retrieval, and management of attachments (PDFs, agreements,
 * KYC documents, brochures) for Leads, Customers, and Properties.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth } from "./auth-server";
import { query, execute, uuid } from "./db";

export interface DocumentAttachmentItem {
  id: string;
  workspace_id: string;
  entity_type: "lead" | "customer" | "property";
  entity_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  category: string;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
}

const ALLOWED_DOC_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
]);

const MAX_DOC_SIZE = 20 * 1024 * 1024; // 20 MB

/* -------------------------------- List ------------------------------------ */

export const listDocumentsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      workspaceId: string;
      entityType: "lead" | "customer" | "property";
      entityId: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<DocumentAttachmentItem[]> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    const rows = await query<any>(
      `SELECT d.id, d.workspace_id, d.entity_type, d.entity_id, d.file_name,
              d.file_url, d.file_size, d.mime_type, d.category, d.uploaded_by,
              d.created_at, p.full_name as uploader_name
       FROM document_attachments d
       LEFT JOIN profiles p ON d.uploaded_by = p.id
       WHERE d.workspace_id = ? AND d.entity_type = ? AND d.entity_id = ?
       ORDER BY d.created_at DESC`,
      [wsId, data.entityType, data.entityId],
    );

    return rows.map((r) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      file_name: r.file_name,
      file_url: r.file_url,
      file_size: Number(r.file_size || 0),
      mime_type: r.mime_type,
      category: r.category || "General",
      uploaded_by: r.uploaded_by,
      uploader_name: r.uploader_name || "System",
      created_at: r.created_at,
    }));
  });

/* -------------------------------- Upload ---------------------------------- */

export const uploadDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      workspaceId: string;
      entityType: "lead" | "customer" | "property";
      entityId: string;
      fileName: string;
      fileBase64: string;
      mimeType: string;
      category?: string;
    }) => {
      if (!input.fileName) throw new Error("File name is required.");
      if (!input.fileBase64) throw new Error("File content is required.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ document: DocumentAttachmentItem }> => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    const ext = path.extname(data.fileName).toLowerCase();
    if (!ALLOWED_DOC_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported file extension: ${ext}. Allowed: PDF, JPG, PNG, DOCX, XLSX, CSV.`);
    }

    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.length === 0) throw new Error("Empty file.");
    if (buffer.length > MAX_DOC_SIZE) {
      throw new Error(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB.`,
      );
    }

    const newDocId = uuid();
    const storedFileName = `${newDocId}${ext}`;
    const uploadBaseDir = process.env["UPLOAD_DIR"] || path.join(process.cwd(), "data", "uploads");
    const wsDir = path.join(uploadBaseDir, wsId);

    await fs.mkdir(wsDir, { recursive: true });
    const targetPath = path.join(wsDir, storedFileName);
    await fs.writeFile(targetPath, buffer);

    const publicUrl = `/api/uploads/${wsId}/${storedFileName}`;

    await execute(
      `INSERT INTO document_attachments
        (id, workspace_id, entity_type, entity_id, file_name, file_url, file_size, mime_type, category, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newDocId,
        wsId,
        data.entityType,
        data.entityId,
        data.fileName.trim(),
        publicUrl,
        buffer.length,
        data.mimeType,
        data.category?.trim() || "General",
        context.userId,
      ],
    );

    return {
      document: {
        id: newDocId,
        workspace_id: wsId,
        entity_type: data.entityType,
        entity_id: data.entityId,
        file_name: data.fileName.trim(),
        file_url: publicUrl,
        file_size: buffer.length,
        mime_type: data.mimeType,
        category: data.category?.trim() || "General",
        uploaded_by: context.userId,
        uploader_name: context.role,
        created_at: new Date().toISOString(),
      },
    };
  });

/* -------------------------------- Delete ---------------------------------- */

export const deleteDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; documentId: string }) => input)
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    const doc = await query<any>(
      `SELECT file_url FROM document_attachments WHERE id = ? AND workspace_id = ?`,
      [data.documentId, wsId],
    );

    if (doc.length > 0 && doc[0].file_url) {
      const filename = path.basename(doc[0].file_url);
      const uploadBaseDir = process.env["UPLOAD_DIR"] || path.join(process.cwd(), "data", "uploads");
      const filePath = path.join(uploadBaseDir, wsId, filename);
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignored if file already removed from disk
      }
    }

    await execute(
      `DELETE FROM document_attachments WHERE id = ? AND workspace_id = ?`,
      [data.documentId, wsId],
    );

    return { success: true };
  });
