import type { ReactNode } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
      <AlertTriangle className="text-destructive h-6 w-6" />
      <div>
        <p className="text-sm font-semibold">We couldn’t load this</p>
        <p className="text-muted-foreground mt-1 text-sm">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PermissionDenied({
  description = "Your role doesn’t include access to this area. Ask a workspace owner if you need it.",
}: {
  description?: string;
}) {
  return <EmptyState icon={ShieldAlert} title="You don’t have access" description={description} />;
}

/** Renders loading / error / empty / content for a TanStack Query result. */
export function DataState<T>({
  query,
  empty,
  children,
  loadingLabel,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: T | undefined;
    refetch: () => void;
  };
  empty?: { when: (data: T) => boolean; node: ReactNode };
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}) {
  if (query.isPending) return <LoadingState {...(loadingLabel ? { label: loadingLabel } : {})} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (empty && empty.when(data)) return <>{empty.node}</>;
  return <>{children(data)}</>;
}
