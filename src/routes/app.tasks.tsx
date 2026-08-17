import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listTasks, createTask, updateTask, qk, type Task } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatTime } from "@/lib/format";
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
  const { workspace, user } = useSession();
  const queryClient = useQueryClient();
  const [titleInput, setTitleInput] = useState("");

  const tasksQuery = useQuery({
    queryKey: qk.tasks(workspace.id),
    queryFn: () => listTasks(workspace.id),
    enabled: !!workspace.id,
  });

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
      setTitleInput("");
      toast.success("Task added successfully.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create task.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateTask(id, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: qk.tasks(workspace.id) });
      toast.success(status === "Completed" ? "Task marked as completed." : "Task reopened.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update task.");
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
      <PageHeader title="Tasks" description="Small, clear, done." />
      <SectionCard title="Quick add">
        <form className="flex flex-wrap gap-2" onSubmit={handleAddTask}>
          <Input
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="What needs doing?"
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Add task
          </Button>
        </form>
      </SectionCard>

      <DataState query={tasksQuery} loadingLabel="Loading tasks…">
        {(taskList) => {
          const todayStr = new Date().toDateString();
          const open = taskList.filter((t) => t.status === "Open" || t.status === "In Progress");

          const groups = [
            {
              label: "Today",
              items: open.filter((t) => t.due_at && new Date(t.due_at).toDateString() === todayStr),
            },
            {
              label: "Upcoming",
              items: open.filter(
                (t) => !t.due_at || new Date(t.due_at).toDateString() !== todayStr,
              ),
            },
            { label: "Completed", items: taskList.filter((t) => t.status === "Completed") },
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
                        title={`Nothing ${g.label.toLowerCase()}`}
                        description="Add a task above to keep the day moving."
                      />
                    </div>
                  ) : (
                    <ul className="divide-border divide-y">
                      {g.items.map((t) => (
                        <li
                          key={t.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-5"
                        >
                          <div className="min-w-0">
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
                            <p className="text-muted-foreground truncate text-xs">
                              {t.priority} priority
                              {t.description ? ` · ${t.description}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {t.due_at && (
                              <span className="text-muted-foreground text-xs">
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
                          </div>
                        </li>
                      ))}
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
