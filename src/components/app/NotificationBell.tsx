import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CheckCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  CheckSquare,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  qk,
  type Notification,
} from "@/lib/crm-api";
import { relativeTime } from "@/lib/format";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const countQuery = useQuery({
    queryKey: qk.notificationCount(),
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30000,
  });

  const listQuery = useQuery({
    queryKey: qk.notifications(),
    queryFn: () => listNotifications(30),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.notificationCount() });
      queryClient.invalidateQueries({ queryKey: qk.notifications() });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.notificationCount() });
      queryClient.invalidateQueries({ queryKey: qk.notifications() });
    },
  });

  const unreadCount = countQuery.data ?? 0;
  const notifications = listQuery.data ?? [];

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) {
      markReadMutation.mutate(n.id);
    }
    setOpen(false);

    if (n.entity_type === "lead" && n.entity_id) {
      navigate({ to: "/app/leads/$leadId", params: { leadId: n.entity_id } });
    } else if (n.entity_type === "customer" && n.entity_id) {
      navigate({ to: "/app/customers/$customerId", params: { customerId: n.entity_id } });
    } else if (n.entity_type === "task") {
      navigate({ to: "/app/tasks" });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "lead_assigned":
        return <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />;
      case "lead_created":
        return <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
      case "lead_converted":
        return <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case "task_assigned":
        return <CheckSquare className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />;
      default:
        return <Clock className="h-4 w-4 text-primary shrink-0" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="relative text-foreground hover:bg-accent/60"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 sm:w-96 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              disabled={markAllMutation.isPending}
              onClick={() => markAllMutation.mutate()}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <p>No notifications yet.</p>
              <p className="mt-1 text-xs">Updates on leads and tasks will appear here.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`flex cursor-pointer items-start gap-3 p-3.5 text-left transition-colors hover:bg-accent/50 ${
                  !n.is_read ? "bg-primary/5 dark:bg-primary/10" : ""
                }`}
              >
                <div className="mt-0.5">{getIcon(n.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`text-xs font-medium ${!n.is_read ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                    >
                      {n.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {relativeTime(n.created_at)}
                    </span>
                  </div>
                  {n.message && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  )}
                </div>
                {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
