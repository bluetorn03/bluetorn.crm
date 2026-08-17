import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("bg-card border-border elev-1 rounded-xl border", className)}>
      {(title || action) && (
        <div className="border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
