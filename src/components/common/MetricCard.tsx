import { Link } from "@tanstack/react-router";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  to,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  icon: LucideIcon;
  to?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "bg-card border-border elev-1 hover:elev-2 group relative flex flex-col justify-between rounded-xl border p-4 transition-shadow sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <span className="bg-accent text-accent-foreground grid h-8 w-8 shrink-0 place-items-center rounded-lg">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 flex items-center gap-2">
          {typeof delta === "number" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                delta >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {delta >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(delta)}%
            </span>
          )}
          {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
        </div>
      </div>
      {to && (
        <ArrowUpRight className="text-muted-foreground absolute top-4 right-4 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-0" />
      )}
    </div>
  );

  return to ? (
    <Link to={to} className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}
