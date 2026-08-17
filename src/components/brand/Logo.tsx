import logo from "@/assets/Bluetorn Logo.png";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="Bluetorn"
      width={40}
      height={40}
      className={cn("rounded-[10px] object-cover", className)}
    />
  );
}

export function Logo({
  className,
  size = "md",
  showTagline = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}) {
  const mark = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark className={mark} />
      <div className="min-w-0">
        <div className={cn("font-semibold tracking-tight", text)}>
          BLUETORN <span className="text-muted-foreground font-medium">CRM</span>
        </div>
        {showTagline && (
          <p className="text-muted-foreground text-xs">Work faster. Sell smarter.</p>
        )}
      </div>
    </div>
  );
}
