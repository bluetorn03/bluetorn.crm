/**
 * BLUETORN CRM — Reusable Image Upload Component.
 *
 * Supports drag-and-drop, file picker, and external URL input.
 * Used for: Property image, Workspace logo.
 *
 * Images uploaded via this component are persisted to the server filesystem
 * and referenced by URL in MySQL.
 */
import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import { ImagePlus, Loader2, Trash2, Upload, Link, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadImageFn, deleteUploadedImageFn } from "@/lib/upload.functions";
import { toast } from "sonner";

/* ---------------------------------- types ---------------------------------- */

interface ImageUploadProps {
  /** Current image URL — empty string means no image. */
  value: string;
  /** Called when the image URL changes (new upload, URL input, or removal). */
  onChange: (url: string) => void;
  /** Workspace ID for upload scoping and authorization. */
  workspaceId: string;
  /** Field label. */
  label?: string;
  /** Additional hint text displayed below the label. */
  hint?: string;
  /** Disable all interactions. */
  disabled?: boolean;
  /** Maximum height for the preview area. Default: 160px. */
  previewHeight?: string;
}

/* ---------------------------------- consts --------------------------------- */

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp";
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/* -------------------------------- helpers ---------------------------------- */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data-URL prefix, return only the base64 payload
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/* -------------------------------- component -------------------------------- */

export function ImageUpload({
  value,
  onChange,
  workspaceId,
  label = "Image",
  hint,
  disabled = false,
  previewHeight = "h-40",
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ----- file handling ----- */

  const processFile = useCallback(
    async (file: File) => {
      // Client-side validation
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error("Invalid file type. Only JPG, PNG, and WEBP are allowed.");
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        toast.error(
          `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_SIZE_MB} MB.`,
        );
        return;
      }

      setUploading(true);
      try {
        const base64Data = await fileToBase64(file);
        const result = await uploadImageFn({
          data: {
            workspaceId,
            base64Data,
            filename: file.name,
            mimeType: file.type,
          },
        });
        onChange(result.url);
        setShowUrlInput(false);
        setImgError(false);
        toast.success("Image uploaded successfully.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [workspaceId, onChange],
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [processFile],
  );

  /* ----- drag & drop ----- */

  const handleDrag = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || uploading) return;
      if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
      if (e.type === "dragleave") setDragActive(false);
    },
    [disabled, uploading],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (disabled || uploading) return;
      const file = e.dataTransfer?.files?.[0];
      if (file) processFile(file);
    },
    [disabled, uploading, processFile],
  );

  /* ----- remove ----- */

  const handleRemove = useCallback(async () => {
    if (value.startsWith("/api/uploads/")) {
      try {
        await deleteUploadedImageFn({ data: { workspaceId, url: value } });
      } catch {
        // Ignore delete errors — the image reference will be cleared regardless
      }
    }
    onChange("");
    setImgError(false);
  }, [value, workspaceId, onChange]);

  /* ----- URL input ----- */

  const applyUrl = useCallback(() => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    if (!isExternalUrl(trimmed)) {
      toast.error("Please enter a valid HTTPS image URL.");
      return;
    }
    onChange(trimmed);
    setUrlDraft("");
    setShowUrlInput(false);
    setImgError(false);
  }, [urlDraft, onChange]);

  /* -------------------------------- render --------------------------------- */

  const hasImage = Boolean(value);

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs">{label}</Label>}
      {hint && <p className="text-[11px] text-muted-foreground -mt-0.5">{hint}</p>}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={handleFileInput}
        disabled={disabled || uploading}
      />

      {/* --- STATE: uploading --- */}
      {uploading && (
        <div
          className={`flex items-center justify-center rounded-lg border border-dashed border-primary/40 bg-primary/5 ${previewHeight}`}
        >
          <div className="flex flex-col items-center gap-2 text-primary">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs font-medium">Uploading…</span>
          </div>
        </div>
      )}

      {/* --- STATE: has image → preview --- */}
      {!uploading && hasImage && (
        <div className="space-y-2">
          <div
            className={`relative overflow-hidden rounded-lg border border-border bg-muted/30 ${previewHeight}`}
          >
            {!imgError ? (
              <img
                src={value}
                alt="Preview"
                className="h-full w-full object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImagePlus className="h-8 w-8" />
                <span className="text-xs">Failed to load preview</span>
                <span className="text-[10px] max-w-[80%] truncate">{value}</span>
              </div>
            )}
          </div>
          {!disabled && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleRemove}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <RefreshCw className="mr-1 h-3 w-3" /> Replace
              </Button>
            </div>
          )}
        </div>
      )}

      {/* --- STATE: no image → drop zone --- */}
      {!uploading && !hasImage && (
        <div className="space-y-2">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors " +
              (dragActive
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40") +
              (disabled ? " pointer-events-none opacity-50" : "")
            }
            onClick={() => !disabled && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-5 w-5" />
            <span className="text-xs font-medium">
              Drag & drop image here or <span className="text-primary underline">browse</span>
            </span>
            <span className="text-[10px]">JPG, PNG, WEBP · Max {MAX_SIZE_MB} MB</span>
          </div>

          {/* URL toggle */}
          {!showUrlInput ? (
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
              onClick={() => setShowUrlInput(true)}
              disabled={disabled}
            >
              <Link className="h-3 w-3" /> or paste image URL
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="h-8 text-xs flex-1"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyUrl())}
                disabled={disabled}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs px-3"
                onClick={applyUrl}
                disabled={disabled || !urlDraft.trim()}
              >
                Apply
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2"
                onClick={() => {
                  setShowUrlInput(false);
                  setUrlDraft("");
                }}
              >
                ✕
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
