import { Phone, StickyNote, ArrowRightLeft, MapPin, IndianRupee, Mail, MessageCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Activity } from "@/lib/mock-data";

const icons = {
  call: Phone,
  note: StickyNote,
  status: ArrowRightLeft,
  visit: MapPin,
  payment: IndianRupee,
  email: Mail,
  whatsapp: MessageCircle,
};

export function Timeline({ items }: { items: Activity[] }) {
  return (
    <ol className="relative space-y-5">
      {items.map((item, idx) => {
        const Icon = icons[item.kind];
        return (
          <li key={item.id} className="relative flex gap-3">
            {idx !== items.length - 1 && (
              <span className="bg-border absolute top-8 left-[15px] h-[calc(100%+4px)] w-px" />
            )}
            <span className="bg-accent text-accent-foreground grid h-8 w-8 shrink-0 place-items-center rounded-full">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{item.actor}</span>{" "}
                <span className="text-muted-foreground">{item.action}</span>{" "}
                <span className="font-medium">{item.target}</span>
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">{formatDateTime(item.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
