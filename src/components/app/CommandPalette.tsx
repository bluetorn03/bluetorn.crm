import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileText,
  ListChecks,
  Plus,
  Users,
  UserRound,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { customers, invoices, leads, payments, properties, tasks, users } from "@/lib/mock-data";

const recents = ["Karan Bhatia", "Azure Heights — 1204", "INV-2041"];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search customers, leads, properties, invoices…" />
      <CommandList>
        <CommandEmpty>
          <div className="py-6 text-center">
            <p className="text-sm font-medium">No results found</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Try a name, phone number, invoice number or property.
            </p>
          </div>
        </CommandEmpty>
        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go("/app/leads")}>
            <Plus className="mr-2 h-4 w-4" /> Add lead
          </CommandItem>
          <CommandItem onSelect={() => go("/app/customers")}>
            <Plus className="mr-2 h-4 w-4" /> Add customer
          </CommandItem>
          <CommandItem onSelect={() => go("/app/finance/invoices/new")}>
            <Plus className="mr-2 h-4 w-4" /> Create invoice
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Recent searches">
          {recents.map((r) => (
            <CommandItem key={r} onSelect={() => go("/app")}>
              <ListChecks className="mr-2 h-4 w-4" /> {r}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Leads">
          {leads.slice(0, 5).map((l) => (
            <CommandItem key={l.id} value={`${l.name} ${l.phone} lead`} onSelect={() => go(`/app/leads/${l.id}`)}>
              <UserRound className="mr-2 h-4 w-4" />
              <span className="truncate">{l.name}</span>
              <span className="text-muted-foreground ml-auto text-xs">{l.status}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Customers">
          {customers.slice(0, 5).map((c) => (
            <CommandItem key={c.id} value={`${c.name} ${c.phone} customer`} onSelect={() => go(`/app/customers/${c.id}`)}>
              <Users className="mr-2 h-4 w-4" />
              <span className="truncate">{c.name}</span>
              <span className="text-muted-foreground ml-auto text-xs">{c.type}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Properties">
          {properties.map((p) => (
            <CommandItem key={p.id} value={`${p.name} ${p.location} property`} onSelect={() => go(`/app/properties/${p.id}`)}>
              <Building2 className="mr-2 h-4 w-4" />
              <span className="truncate">{p.name}</span>
              <span className="text-muted-foreground ml-auto text-xs">{p.status}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Invoices & payments">
          {invoices.slice(0, 4).map((i) => (
            <CommandItem key={i.id} value={`${i.number} ${i.customer} invoice`} onSelect={() => go(`/app/finance/invoices/${i.id}`)}>
              <FileText className="mr-2 h-4 w-4" />
              {i.number} · {i.customer}
            </CommandItem>
          ))}
          {payments.slice(0, 3).map((p) => (
            <CommandItem key={p.id} value={`${p.reference} ${p.customer} payment`} onSelect={() => go("/app/finance/payments")}>
              <CreditCard className="mr-2 h-4 w-4" />
              {p.reference} · {p.customer}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Tasks & team">
          {tasks.slice(0, 3).map((t) => (
            <CommandItem key={t.id} value={`${t.title} task`} onSelect={() => go("/app/tasks")}>
              <CheckSquare className="mr-2 h-4 w-4" />
              {t.title}
            </CommandItem>
          ))}
          {users.slice(0, 3).map((u) => (
            <CommandItem key={u.id} value={`${u.name} user`} onSelect={() => go("/app/settings")}>
              <CalendarDays className="mr-2 h-4 w-4" />
              {u.name} · {u.role}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
