import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CheckSquare, CreditCard, FileText, Plus, Users, UserRound } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { searchCrm, qk } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const [q, setQ] = useState("");

  const searchQuery = useQuery({
    queryKey: qk.search(workspace.id, q),
    queryFn: () => searchCrm(workspace.id, q),
    enabled: !!workspace.id && open,
  });

  const res = searchQuery.data ?? {
    leads: [],
    customers: [],
    properties: [],
    invoices: [],
    payments: [],
    tasks: [],
  };

  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  const hasResults =
    res.leads.length > 0 ||
    res.customers.length > 0 ||
    res.properties.length > 0 ||
    res.invoices.length > 0 ||
    res.payments.length > 0 ||
    res.tasks.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search customers, leads, properties, invoices…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        {!hasResults && q.trim().length > 0 && (
          <CommandEmpty>
            <div className="py-6 text-center">
              <p className="text-sm font-medium">No results found</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Try a name, phone number, invoice number or property.
              </p>
            </div>
          </CommandEmpty>
        )}

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
        <CommandSeparator />

        {res.leads.length > 0 && (
          <CommandGroup heading="Leads">
            {res.leads.map((l) => (
              <CommandItem
                key={l.id}
                value={`${l.name} ${l.phone || ""} lead`}
                onSelect={() => go(`/app/leads/${l.id}`)}
              >
                <UserRound className="mr-2 h-4 w-4" />
                <span className="truncate">{l.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">{l.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {res.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {res.customers.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.phone || ""} customer`}
                onSelect={() => go(`/app/customers/${c.id}`)}
              >
                <Users className="mr-2 h-4 w-4" />
                <span className="truncate">{c.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">{c.type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {res.properties.length > 0 && (
          <CommandGroup heading="Properties">
            {res.properties.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.location || ""} property`}
                onSelect={() => go(`/app/properties/${p.id}`)}
              >
                <Building2 className="mr-2 h-4 w-4" />
                <span className="truncate">{p.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">{p.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(res.invoices.length > 0 || res.payments.length > 0) && (
          <CommandGroup heading="Invoices & payments">
            {res.invoices.map((i) => (
              <CommandItem
                key={i.id}
                value={`${i.number} ${i.customer} invoice`}
                onSelect={() => go(`/app/finance/invoices/${i.id}`)}
              >
                <FileText className="mr-2 h-4 w-4" />
                {i.number} · {i.customer}
              </CommandItem>
            ))}
            {res.payments.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.reference} ${p.customer} payment`}
                onSelect={() => go("/app/finance/payments")}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {p.reference} · {p.customer}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {res.tasks.length > 0 && (
          <CommandGroup heading="Tasks">
            {res.tasks.map((t) => (
              <CommandItem key={t.id} value={`${t.title} task`} onSelect={() => go("/app/tasks")}>
                <CheckSquare className="mr-2 h-4 w-4" />
                {t.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
