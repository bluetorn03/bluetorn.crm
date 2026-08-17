import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listPromoMedia, createPromoMedia, updatePromoMedia, deletePromoMedia, qk } from "@/lib/crm-api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/media")({
  head: () => ({
    meta: [
      { title: "Promotional media · BLUETORN CRM" },
      { name: "description", content: "Manage the login-screen promotional media wall." },
      { property: "og:title", content: "Promotional media · BLUETORN CRM" },
      { property: "og:description", content: "Manage the login-screen promotional media wall." },
    ],
  }),
  component: AdminMedia,
});

function AdminMedia() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    imageUrl: "",
    target: "All workspaces",
  });

  const mediaQuery = useQuery({
    queryKey: qk.promos(),
    queryFn: () => listPromoMedia(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createPromoMedia({
        title: form.title.trim(),
        body: form.body.trim() || null,
        image_url: form.imageUrl.trim() || null,
        target: form.target.trim() || "All workspaces",
        is_active: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.promos() });
      setDialogOpen(false);
      setForm({ title: "", body: "", imageUrl: "", target: "All workspaces" });
      toast.success("Promotional banner added.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create media.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updatePromoMedia(id, { is_active: !isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.promos() });
      toast.success("Media item status updated.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update media.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePromoMedia(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.promos() });
      toast.success("Media item deleted.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete media.");
    },
  });

  const handleAddMedia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title is required.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Promotional Media"
        description="Manage banners, updates and testimonials shown on the login screen wall."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add media banner
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddMedia}>
            <DialogHeader>
              <DialogTitle>Add Promotional Banner</DialogTitle>
              <DialogDescription>Display announcements and features on login wall.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="titleInput">Title *</Label>
                <Input
                  id="titleInput"
                  placeholder="BLUETORN v2.4 Release"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bodyInput">Body Description</Label>
                <Input
                  id="bodyInput"
                  placeholder="Explain what is new or highlighted"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imageInput">Image URL</Label>
                <Input
                  id="imageInput"
                  placeholder="https://images.unsplash.com/..."
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetInput">Target</Label>
                <Input
                  id="targetInput"
                  placeholder="All workspaces"
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Publish Media
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DataState query={mediaQuery} loadingLabel="Loading promotional media…">
        {(promos) => (
          <div className="grid gap-4 md:grid-cols-2">
            {promos.map((p) => (
              <SectionCard key={p.id} className="relative overflow-hidden">
                <div className="flex items-start justify-between gap-2">
                  <StatusBadge label={p.target ?? "All"} tone="info" />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: p.id, isActive: p.is_active })}
                      className="cursor-pointer"
                      disabled={toggleMutation.isPending}
                    >
                      <StatusBadge label={p.is_active ? "Active" : "Hidden"} />
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteMutation.mutate(p.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <h3 className="text-base font-semibold mt-2">{p.title}</h3>
                <p className="text-muted-foreground text-xs mt-1">{p.body ?? ""}</p>

                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt={p.title}
                    className="mt-3 h-32 w-full rounded-lg object-cover border border-border"
                  />
                )}
              </SectionCard>
            ))}
          </div>
        )}
      </DataState>
    </div>
  );
}
