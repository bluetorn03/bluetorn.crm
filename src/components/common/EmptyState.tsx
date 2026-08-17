import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border bg-card flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="bg-accent text-accent-foreground mb-4 grid h-12 w-12 place-items-center rounded-full">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
