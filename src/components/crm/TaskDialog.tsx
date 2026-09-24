import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimeField } from "@/components/common/DateTimeField";
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
  createTask,
  updateTask,
  listMembers,
  listLeads,
  listCustomers,
  listProperties,
  taskPriorities,
  taskStatuses,
  qk,
  type Task,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export function TaskDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
}) {
  const { workspace, user, role, dbRole } = useSession();
  const queryClient = useQueryClient();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const isEdit = !!task;
  const [dueError, setDueError] = useState<string | null>(null);

  const defaultIsoDate = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    return now.toISOString();
  };

  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    due_at: task?.due_at ? new Date(task.due_at).toISOString() : defaultIsoDate(),
    priority: task?.priority ?? "Medium",
    status: task?.status ?? "Open",
    assigned_to: task?.assigned_to ?? "unassigned",
    lead_id: task?.lead_id ?? "none",
    customer_id: task?.customer_id ?? "none",
    property_id: task?.property_id ?? "none",
  });

  useEffect(() => {
    setDueError(null);
    if (task) {
      setForm({
        title: task.title ?? "",
        description: task.description ?? "",
        due_at: task.due_at ? new Date(task.due_at).toISOString() : defaultIsoDate(),
        priority: task.priority ?? "Medium",
        status: task.status ?? "Open",
        assigned_to: task.assigned_to ?? "unassigned",
        lead_id: task.lead_id ?? "none",
        customer_id: task.customer_id ?? "none",
        property_id: task.property_id ?? "none",
      });
    } else {
      setForm({
        title: "",
        description: "",
        due_at: defaultIsoDate(),
        priority: "Medium",
        status: "Open",
        assigned_to: "unassigned",
        lead_id: "none",
        customer_id: "none",
        property_id: "none",
      });
    }
  }, [task, open]);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const leadsQuery = useQuery({
    queryKey: qk.leads(workspace.id),
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id && open,
  });

  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const propertiesQuery = useQuery({
    queryKey: qk.properties(workspace.id),
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id && open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_at: form.due_at,
        priority: form.priority,
        status: form.status,
        lead_id: form.lead_id === "none" ? null : form.lead_id,
        customer_id: form.customer_id === "none" ? null : form.customer_id,
        property_id: form.property_id === "none" ? null : form.property_id,
      };

      if (canAssign) {
        payload.assigned_to = form.assigned_to === "unassigned" ? null : form.assigned_to;
      }

      if (isEdit && task) {
        return updateTask(task.id, payload);
      } else {
        return createTask({
          ...payload,
          workspace_id: workspace.id,
          created_by: user.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.tasks(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.events(workspace.id) });
      toast.success(isEdit ? "Task updated." : "Task created.");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save task.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDueError(null);

    if (!form.title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    if (!form.due_at) {
      setDueError("Please select a valid due date and time.");
      toast.error("Please select a valid due date and time.");
      return;
    }

    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md w-full max-w-[calc(100vw-2rem)] p-4 sm:p-6">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Task" : "Create Task"}</DialogTitle>
            <DialogDescription>
              Assign work, set priority, due date, and link to CRM records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 min-w-0 w-full">
            <div className="space-y-1.5">
              <Label htmlFor="taskTitle">Task Title *</Label>
              <Input
                id="taskTitle"
                placeholder="What needs to be done?"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="taskPriority">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger id="taskPriority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskPriorities.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taskStatus">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger id="taskStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <DateTimeField
                  label="Due Date & Time *"
                  value={form.due_at}
                  onChange={(next) => {
                    setDueError(null);
                    setForm({ ...form, due_at: next ?? "" });
                  }}
                  {...(dueError ? { error: dueError } : {})}
                  withTime
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="taskAssignee">Assigned Employee</Label>
                {canAssign ? (
                  <Select
                    value={form.assigned_to}
                    onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                  >
                    <SelectTrigger id="taskAssignee">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned (No assignee)</SelectItem>
                      {membersQuery.data?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name} {m.email ? `(${m.email})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground font-medium h-9 flex items-center">
                    {membersQuery.data?.find((m) => m.id === (task?.assigned_to ?? form.assigned_to))?.full_name || "Unassigned"}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taskDesc">Description</Label>
              <Textarea
                id="taskDesc"
                placeholder="Additional notes or instructions..."
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground">Link to CRM Record (Optional)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="taskLead" className="text-[11px]">Lead</Label>
                  <Select
                    value={form.lead_id}
                    onValueChange={(v) => setForm({ ...form, lead_id: v })}
                  >
                    <SelectTrigger id="taskLead" className="text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {leadsQuery.data?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="taskCustomer" className="text-[11px]">Customer</Label>
                  <Select
                    value={form.customer_id}
                    onValueChange={(v) => setForm({ ...form, customer_id: v })}
                  >
                    <SelectTrigger id="taskCustomer" className="text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {customersQuery.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="taskProperty" className="text-[11px]">Property</Label>
                  <Select
                    value={form.property_id}
                    onValueChange={(v) => setForm({ ...form, property_id: v })}
                  >
                    <SelectTrigger id="taskProperty" className="text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {propertiesQuery.data?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isEdit ? "Save Task" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
