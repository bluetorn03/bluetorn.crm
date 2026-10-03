import { useMemo } from "react";
import { amountToWords } from "@/lib/amount-to-words";
import { cn } from "@/lib/utils";

interface AmountInWordsProps {
  amount: number | string | null | undefined;
  currency?: string;
  className?: string;
  label?: string;
  prefix?: string;
}

export function AmountInWords({
  amount,
  currency = "INR",
  className,
  label = "Amount in words:",
  prefix,
}: AmountInWordsProps) {
  const words = useMemo(() => {
    return amountToWords(amount, currency);
  }, [amount, currency]);

  if (!words) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs transition-colors",
        className,
      )}
      aria-live="polite"
    >
      {label && <span className="font-semibold text-muted-foreground mr-1.5">{label}</span>}
      {prefix && <span className="text-muted-foreground mr-1">{prefix}</span>}
      <span className="font-medium text-foreground tracking-wide italic">{words}</span>
    </div>
  );
}
