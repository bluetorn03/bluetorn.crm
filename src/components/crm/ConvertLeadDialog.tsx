import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Loader2, AlertCircle, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  convertLeadToCustomer,
  listCustomers,
  listProperties,
  listMembers,
  qk,
  type Lead,
  type Customer,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

export function ConvertLeadDialog({
  open,
  onOpenChange,
  lead,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  onConverted?: (customer: Customer) => void;
}) {
  const { workspace } = useSession();
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const propertiesQuery = useQuery({
    queryKey: qk.properties(workspace.id),
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id && open && !!lead.property_id,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open && !!lead.assigned_to,
  });

  const customers = customersQuery.data ?? [];
  const leadPhone = lead.phone?.trim();
  const leadEmail = lead.email?.trim().toLowerCase();

  const existingLinkedCustomer = lead.customer_id
    ? customers.find((c) => c.id === lead.customer_id)
    : null;

  const matchingCustomer = !existingLinkedCustomer
    ? customers.find((c) => {
        const phoneMatch = leadPhone && c.phone && c.phone.trim() === leadPhone;
        const emailMatch = leadEmail && c.email && c.email.trim().toLowerCase() === leadEmail;
        return phoneMatch || emailMatch;
      })
    : null;

  const interestedProperty = propertiesQuery.data?.find((p) => p.id === lead.property_id);
  const assignedOwner = membersQuery.data?.find((m) => m.id === lead.assigned_to);

  const convertMutation = useMutation({
    mutationFn: () => convertLeadToCustomer(lead.id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: qk.lead(lead.id) });
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.customers(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.customer(res.customer.id) });
      queryClient.invalidateQueries({ queryKey: qk.leadActivity(lead.id) });
      queryClient.invalidateQueries({ queryKey: qk.tasks(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.events(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.dashboard(workspace.id) });

      if (res.alreadyConverted) {
        toast.info(`Lead is already linked to customer "${res.customer.name}".`);
      } else if (res.isNew) {
        toast.success(`Created customer "${res.customer.name}" and linked lead.`);
      } else {
        toast.success(`Linked lead to existing customer "${res.customer.name}".`);
      }

      onOpenChange(false);
      onConverted?.(res.customer);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to convert lead to customer.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserCheck className="h-5 w-5 text-primary" />
            Convert Lead to Customer
          </DialogTitle>
          <DialogDescription>
            Convert qualified lead details into a customer relationship record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Match & Duplicate Status Notice */}
          {existingLinkedCustomer ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-950 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs">Already Converted</p>
                  <p className="text-xs mt-0.5">
                    This lead is already linked to customer{" "}
                    <strong className="underline">{existingLinkedCustomer.name}</strong>. Converting
                    again will preserve the current link.
                  </p>
                </div>
              </div>
            </div>
          ) : matchingCustomer ? (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-blue-950 dark:text-blue-200">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs">Existing Matching Customer Detected</p>
                  <p className="text-xs mt-0.5">
                    Found matching profile:{" "}
                    <strong>{matchingCustomer.name}</strong> ({matchingCustomer.phone || matchingCustomer.email}).
                    Conversion will link this lead to the existing customer profile without creating duplicates.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-950 dark:text-emerald-200">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs">New Customer Profile Creation</p>
                  <p className="text-xs mt-0.5">
                    No matching customer found by phone or email. A new active customer profile will be created.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Summary Box */}
          <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2.5">
            <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
              Lead → Customer Transfer Mapping
            </h4>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{lead.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{lead.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium truncate">{lead.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lead Source</dt>
                <dd className="font-medium">{lead.source}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Assigned Agent</dt>
                <dd className="font-medium">{assignedOwner?.full_name || "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Customer Value (Budget)</dt>
                <dd className="font-medium text-emerald-600 dark:text-emerald-400 font-semibold">
                  {lead.budget ? formatMoney(lead.budget, (lead.currency || workspace.currency) as any) : "—"}
                </dd>
              </div>
              {lead.requirement && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Requirement</dt>
                  <dd className="font-medium">{lead.requirement}</dd>
                </div>
              )}
              {interestedProperty && (
                <div className="col-span-2 flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-muted-foreground">Interested Property:</span>
                    <span className="font-semibold">{interestedProperty.name}</span>
                  </div>
                  {interestedProperty.location && (
                    <span className="text-xs text-muted-foreground">({interestedProperty.location})</span>
                  )}
                </div>
              )}
            </dl>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={convertMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => convertMutation.mutate()}
            disabled={convertMutation.isPending}
          >
            {convertMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <UserCheck className="mr-1.5 h-4 w-4" />
            Convert to Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
