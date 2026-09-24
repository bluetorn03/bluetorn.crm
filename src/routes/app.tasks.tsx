import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckSquare,
  Plus,
  Loader2,
  Edit,
  Trash2,
  MoreVertical,
  Calendar,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listTasks,
  listMembers,
  createTask,
  updateTask,
  deleteTask,
  qk,
  type Task,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatTime } from "@/lib/format";
import { getOverdueDays } from "@/lib/date-utils";
import { TaskDialog } from "@/components/crm/TaskDialog";
import { AssignTaskDialog } from "@/components/crm/AssignTaskDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · BLUETORN CRM" },
      { name: "description", content: "Today, upcoming and completed work across your team." },
      { property: "og:title", content: "Tasks · BLUETORN CRM" },
      { property: "og:description", content: "Today, upcoming and completed work in one list." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { workspace, user, role, dbRole } = useSession();
  const queryClient = useQueryClient();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [titleInput, setTitleInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [assigningTask, setAssigningTask] = useState<Task | null>(null);

  const tasksQuery = useQuery({
    queryKey: qk.tasks(workspace.id),
    queryFn: () => listTasks(workspace.id),
    enabled: !!workspace.id,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id,
  });
  const memberMap = new Map((membersQuery.data ?? []).map((m) => [m.id, m.full_name]));

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      createTask({
        workspace_id: workspace.id,
        created_by: user.id,
        title,
        priority: "Medium",
        status: "Open",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.tasks(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.events(workspace.id) });
      setTitleInput("");
      toast.success("Task added successfully.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create task.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateTask(id, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: qk.tasks(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.events(workspace.id) });
      toast.success(status === "Completed" ? "Task marked as completed." : "Task reopened.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update task.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.tasks(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.events(workspace.id) });
      toast.success("Task deleted successfully.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete task.");
    },
  });

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = titleInput.trim();
    if (!title) {
      toast.error("Please enter a task title.");
      return;
    }
    createMutation.mutate(title);
  };

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Completed" ? "Open" : "Completed";
    toggleMutation.mutate({ id, status: nextStatus });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Today, upcoming and done."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingTask(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Task
          </Button>
        }
      />

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingTask(null);
        }}
        task={editingTask}
      />

      <AssignTaskDialog
        open={!!assigningTask}
        onOpenChange={(open) => !open && setAssigningTask(null)}
        task={assigningTask}
      />

      <form onSubmit={handleAddTask} className="flex gap-2">
        <Input
          placeholder="Add a new task quickly… (e.g. Call Rajesh about 3BHK flat)"
          value={titleInput}
          onChange={(e) => setTitleInput(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </>
          )}
        </Button>
      </form>

      <DataState query={tasksQuery} loadingLabel="Loading tasks…">
        {(taskList) => {
          const now = new Date();
          const todayStr = now.toDateString();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          const open = taskList.filter((t) => t.status === "Open" || t.status === "In Progress");

          const overdue = open.filter((t) => t.due_at && new Date(t.due_at) < todayStart);
          const overdueIds = new Set(overdue.map((t) => t.id));

          const groups = [
            {
              label: "Overdue",
              items: overdue,
              isOverdue: true,
            },
            {
              label: "Today",
              items: open.filter(
                (t) =>
                  !overdueIds.has(t.id) &&
                  t.due_at &&
                  new Date(t.due_at).toDateString() === todayStr,
              ),
              isOverdue: false,
            },
            {
              label: "Upcoming",
              items: open.filter(
                (t) =>
                  !overdueIds.has(t.id) &&
                  (!t.due_at ||
                    (new Date(t.due_at).toDateString() !== todayStr &&
                      new Date(t.due_at) >= todayStart)),
              ),
              isOverdue: false,
            },
            {
              label: "Completed",
              items: taskList.filter((t) => t.status === "Completed"),
              isOverdue: false,
            },
          ];

          return (
            <>
              {groups.map((g) => (
                <SectionCard
                  key={g.label}
                  title={g.label}
                  description={`${g.items.length} task(s)`}
                  bodyClassName="p-0"
                >
                  {g.items.length === 0 ? (
                    <div className="p-4">
                      <EmptyState
                        icon={CheckSquare}
                        title={
                          g.isOverdue ? "No overdue tasks" : `Nothing ${g.label.toLowerCase()}`
                        }
                        description={
                          g.isOverdue
                            ? "All tasks are on schedule."
                            : "Add a task above to keep the day moving."
                        }
                      />
                    </div>
                  ) : (
                    <ul className="divide-border divide-y">
                      {g.items.map((t) => {
                        const overdueDays = g.isOverdue && t.due_at ? getOverdueDays(t.due_at) : 0;
                        const assignedMemberName = t.assigned_to
                          ? memberMap.get(t.assigned_to) || "Assigned"
                          : "Unassigned";
                        return (
                          <li
                            key={t.id}
                            className={
                              "hover:bg-accent/40 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 transition-colors" +
                              (g.isOverdue ? " border-l-2 border-l-red-500" : "")
                            }
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p
                                  className={
                                    "truncate text-sm font-medium " +
                                    (t.status === "Completed"
                                      ? "text-muted-foreground line-through"
                                      : "")
                                  }
                                >
                                  {t.title}
                                </p>
                              </div>
                              <p className="text-muted-foreground truncate text-xs mt-0.5">
                                {t.priority} priority · Assigned:{" "}
                                <span className="text-foreground font-medium">
                                  {assignedMemberName}
                                </span>
                                {t.description ? ` · ${t.description}` : ""}
                              </p>
                              {g.isOverdue && overdueDays > 0 && (
                                <p className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
                                  <AlertTriangle className="inline-block h-3 w-3 mr-0.5 -mt-0.5" />
                                  Overdue by {overdueDays} day{overdueDays === 1 ? "" : "s"}
                                </p>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {t.due_at && (
                                <span
                                  className={
                                    "text-xs hidden sm:inline-block " +
                                    (g.isOverdue
                                      ? "text-red-600 dark:text-red-400 font-medium"
                                      : "text-muted-foreground")
                                  }
                                >
                                  {formatDate(t.due_at)} {formatTime(t.due_at)}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(t.id, t.status)}
                                className="cursor-pointer"
                                disabled={toggleMutation.isPending}
                              >
                                <StatusBadge label={t.status} />
                              </button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleToggleStatus(t.id, t.status)}
                                  >
                                    <CheckSquare className="mr-2 h-4 w-4" />
                                    {t.status === "Completed"
                                      ? "Mark as Open"
                                      : "Mark as Completed"}
                                  </DropdownMenuItem>
                                  {canAssign && (
                                    <DropdownMenuItem onClick={() => setAssigningTask(t)}>
                                      <UserCheck className="mr-2 h-4 w-4" />
                                      {t.assigned_to ? "Reassign Task" : "Assign Task"}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingTask(t);
                                      setDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="mr-2 h-4 w-4" /> Edit Task
                                  </DropdownMenuItem>
                                  {g.isOverdue && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditingTask(t);
                                        setDialogOpen(true);
                                      }}
                                    >
                                      <Calendar className="mr-2 h-4 w-4" /> Reschedule
                                    </DropdownMenuItem>
                                  )}
                                  {dbRole !== "employee" && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                        onClick={() => deleteMutation.mutate(t.id)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Task
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </SectionCard>
              ))}
            </>
          );
        }}
      </DataState>
    </div>
  );
}
