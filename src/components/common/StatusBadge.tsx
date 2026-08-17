import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneMap: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-destructive/12 text-destructive border-destructive/25",
  info: "bg-info/12 text-info border-info/25",
  brand: "bg-primary/12 text-primary border-primary/25",
};

const labelTone: Record<string, Tone> = {
  Active: "success",
  Available: "success",
  Paid: "success",
  Received: "success",
  Won: "success",
  Completed: "success",
  Healthy: "success",
  Connected: "success",
  Live: "success",
  New: "info",
  Sent: "info",
  Scheduled: "info",
  Contacted: "info",
  Prospect: "info",
  Invited: "info",
  Trial: "info",
  Interested: "brand",
  "Visit / Meeting": "brand",
  Reserved: "warning",
  Booked: "brand",
  Negotiation: "warning",
  "Partially Paid": "warning",
  Pending: "warning",
  Degraded: "warning",
  Draft: "neutral",
  Inactive: "neutral",
  Archived: "neutral",
  Cancelled: "neutral",
  Planned: "neutral",
  Open: "info",
  Sold: "neutral",
  Overdue: "danger",
  Lost: "danger",
  Failed: "danger",
  Locked: "danger",
  Suspended: "danger",
  Disconnected: "danger",
  "No Show": "danger",
};

export function StatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  const resolved = tone ?? labelTone[label] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneMap[resolved],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
