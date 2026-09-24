import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AiInsightCard({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <section
      className={cn(
        "border-primary/25 bg-primary/[0.06] rounded-xl border border-dashed p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary h-4 w-4" />
        <h2 className="text-sm font-semibold">AI Insights</h2>
        <span className="border-primary/30 text-primary ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          Preview
        </span>
      </div>
      <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <span className="bg-primary mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground/70 mt-3 text-xs">
        Concept only — no AI module is active in this prototype.
      </p>
    </section>
  );
}
