import { useMemo, useState } from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function toParts(value: string | null | undefined) {
  if (!value) return { date: undefined as Date | undefined, time: "10:00" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: undefined, time: "10:00" };
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: d, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

function combine(date: Date | undefined, time: string) {
  if (!date) return null;
  const [h, m] = time.split(":");
  const d = new Date(date);
  d.setHours(Number(h ?? 0), Number(m ?? 0), 0, 0);
  return d.toISOString();
}

/**
 * The single date/time interaction used everywhere in BLUETORN — follow-ups,
 * task due dates, calendar events, site visits and invoice dates.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  withTime = true,
  required,
  error,
  id,
  disabledBefore,
}: {
  label?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  withTime?: boolean;
  required?: boolean;
  error?: string | undefined;
  id?: string;
  disabledBefore?: Date;
}) {
  const [open, setOpen] = useState(false);
  const parts = useMemo(() => toParts(value), [value]);

  return (
    <div className="space-y-1.5 min-w-0 w-full">
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0 w-full">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              className={cn(
                "min-w-0 flex-1 justify-start font-normal truncate h-9 text-xs sm:text-sm",
                !parts.date && "text-muted-foreground",
                error && "border-destructive",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">
                {parts.date ? formatDate(parts.date.toISOString()) : "Pick a date"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              {...(parts.date ? { selected: parts.date, defaultMonth: parts.date } : {})}
              {...(disabledBefore ? { disabled: { before: disabledBefore } } : {})}
              onSelect={(d) => {
                onChange(combine(d ?? undefined, parts.time));
                setOpen(false);
              }}
              autoFocus
            />
            {value && (
              <div className="border-border border-t p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Clear
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {withTime && (
          <div className="relative w-full sm:w-32 shrink-0">
            <Clock className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
            <Input
              type="time"
              className="pl-8 text-xs sm:text-sm h-9 w-full"
              value={parts.time}
              disabled={!parts.date}
              onChange={(e) => onChange(combine(parts.date, e.target.value || "10:00"))}
            />
          </div>
        )}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
