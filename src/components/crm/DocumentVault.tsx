import { useState, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File,
  Upload,
  Trash2,
  ExternalLink,
  Download,
  Loader2,
  FolderOpen,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  qk,
  type DocumentAttachmentItem,
} from "@/lib/crm-api";
import { relativeTime } from "@/lib/format";

interface DocumentVaultProps {
  workspaceId: string;
  entityType: "lead" | "customer" | "property";
  entityId: string;
  title?: string;
  description?: string;
  className?: string;
}

const CATEGORIES = [
  "General",
  "KYC Document (Aadhaar / PAN)",
  "Sale Agreement / Deed",
  "Booking Receipt",
  "Floor Plan / Layout",
  "Bank / Loan Sanction",
  "Brochure / Catalog",
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(mime: string, name: string) {
  const lower = name.toLowerCase();
  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  if (mime.includes("image") || lower.match(/\.(jpg|jpeg|png|webp)$/)) {
    return <ImageIcon className="h-5 w-5 text-blue-500" />;
  }
  if (mime.includes("spreadsheet") || mime.includes("excel") || lower.match(/\.(xls|xlsx|csv)$/)) {
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  }
  return <File className="h-5 w-5 text-muted-foreground" />;
}

export function DocumentVault({
  workspaceId,
  entityType,
  entityId,
  title = "Documents & Attachments",
  description = "KYC documents, agreements, receipts, and property files.",
  className,
}: DocumentVaultProps) {
  const queryClient = useQueryClient();
  const fileInputId = useId();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState("General");
  const [customCategory, setCustomCategory] = useState("");

  const docsQuery = useQuery({
    queryKey: qk.documents(workspaceId, entityType, entityId),
    queryFn: () => listDocuments(workspaceId, entityType, entityId),
    enabled: Boolean(workspaceId && entityId),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected.");

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const commaIdx = res.indexOf(",");
          resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const catToUse = category === "Other" && customCategory.trim() ? customCategory.trim() : category;

      await uploadDocument({
        workspaceId,
        entityType,
        entityId,
        fileName: selectedFile.name,
        fileBase64: base64Data,
        mimeType: selectedFile.type || "application/octet-stream",
        category: catToUse,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.documents(workspaceId, entityType, entityId),
      });
      toast.success("Document uploaded successfully.");
      setUploadOpen(false);
      setSelectedFile(null);
      setCategory("General");
      setCustomCategory("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to upload document.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      await deleteDocument(workspaceId, docId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.documents(workspaceId, entityType, entityId),
      });
      toast.success("Document deleted.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete document.");
    },
  });

  const documents = docsQuery.data || [];

  return (
    <div className={`space-y-4 ${className || ""}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            {title} ({documents.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>

        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload File
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-8 text-center bg-muted/10">
          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <h4 className="text-sm font-medium">No documents attached</h4>
          <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
            Attach KYC documents, floor plans, sales deeds, or payment receipts (PDF, Images, Word, Excel).
          </p>
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Attach Document
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card">
          {documents.map((doc: DocumentAttachmentItem) => (
            <div
              key={doc.id}
              className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  {getFileIcon(doc.mime_type, doc.file_name)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-xs text-foreground truncate max-w-[260px] sm:max-w-md">
                    {doc.file_name}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                    <span className="bg-muted px-1.5 py-0.5 rounded font-medium text-foreground/80">
                      {doc.category}
                    </span>
                    <span>· {formatBytes(doc.file_size)}</span>
                    <span>· Uploaded {relativeTime(doc.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View
                  </a>
                </Button>
                <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Download">
                  <a href={doc.file_url} download={doc.file_name}>
                    <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete document "${doc.file_name}"?`)) {
                      deleteMutation.mutate(doc.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attach Document</DialogTitle>
            <DialogDescription className="text-xs">
              Upload a KYC file, contract, or receipt to this {entityType} record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Document Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs">
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="Other" className="text-xs">
                    Other (Custom category)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {category === "Other" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Custom Category Name</Label>
                <Input
                  placeholder="e.g. Electricity Bill"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">File (PDF, Images, DOCX, XLSX up to 20MB)</Label>
              <input
                id={fileInputId}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              {selectedFile && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Selected: <span className="font-medium text-foreground">{selectedFile.name}</span> (
                  {formatBytes(selectedFile.size)})
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={uploadMutation.isPending || !selectedFile}
              onClick={() => uploadMutation.mutate()}
            >
              {uploadMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Upload Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
