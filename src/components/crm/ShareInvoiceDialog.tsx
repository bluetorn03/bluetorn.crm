import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, Copy, Check, ExternalLink, Mail, Share2, Globe, Shield } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";
import type { Invoice } from "@/lib/db-types";

interface ShareInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  workspaceName: string;
  balance: number;
}

export function ShareInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  workspaceName,
  balance,
}: ShareInvoiceDialogProps) {
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedInternal, setCopiedInternal] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = `${origin}/invoice/${invoice.id}`;
  const internalUrl = typeof window !== "undefined" ? window.location.href : "";

  const currency = (invoice.currency ?? "INR") as any;

  // Clean customer phone number for WhatsApp
  const rawPhone = (invoice as any).customer_phone || "";
  const cleanPhone = rawPhone.replace(/[^0-9]/g, "");

  const customerName = (invoice as any).customer_name || "Valued Client";
  const recipientEmail = (invoice as any).customer_email || "";
  const emailSubject = `Invoice ${invoice.invoice_number} from ${workspaceName}`;

  // Pre-filled WhatsApp message
  const whatsappMessage = `Dear ${customerName},

Greetings from ${workspaceName}!

Here is your invoice ${invoice.invoice_number}:
• Total Amount: ${formatMoney(invoice.total, currency)}
• Balance Outstanding: ${formatMoney(balance, currency)}
• Due Date: ${invoice.due_date ? formatDate(invoice.due_date) : "Immediate"}

View your invoice, download PDF, or pay instantly via UPI:
${publicUrl}

Thank you!
— ${workspaceName}`;

  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipientEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(whatsappMessage)}`;

  const handleCopyPublic = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopiedPublic(true);
    toast.success("Public invoice link copied to clipboard!");
    setTimeout(() => setCopiedPublic(false), 2000);
  };

  const handleCopyInternal = () => {
    navigator.clipboard.writeText(internalUrl);
    setCopiedInternal(true);
    toast.success("CRM internal reference copied!");
    setTimeout(() => setCopiedInternal(false), 2000);
  };

  const handleWhatsApp = () => {
    const encoded = encodeURIComponent(whatsappMessage);
    const targetUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Share2 className="h-4 w-4 text-primary" />
            Share Invoice {invoice.invoice_number}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Send this invoice directly to your customer or copy secure viewing links.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Quick Action: WhatsApp Share */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                Share via WhatsApp
              </span>
              {rawPhone && (
                <span className="text-[11px] font-mono text-muted-foreground">{rawPhone}</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Opens WhatsApp with a pre-formatted message including invoice totals, due date, and public payment link.
            </p>
            <Button
              size="sm"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-semibold h-8"
              onClick={handleWhatsApp}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Open WhatsApp
            </Button>
          </div>

          {/* Public Customer View Link */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-foreground">
                <Globe className="h-3.5 w-3.5 text-primary" /> Client Public Link (No Login Needed)
              </span>
              <span className="text-[10px] text-muted-foreground font-normal">Safe for customers</span>
            </Label>
            <div className="flex gap-1.5">
              <Input
                readOnly
                value={publicUrl}
                className="font-mono text-xs h-8 select-all bg-muted/40"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 shrink-0 gap-1 text-xs"
                onClick={handleCopyPublic}
              >
                {copiedPublic ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedPublic ? "Copied" : "Copy"}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                asChild
              >
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" title="Preview public view">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>

          {/* Email Invoice */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" /> Send via Email
                </p>
                {recipientEmail ? (
                  <p className="text-[11px] font-mono text-muted-foreground">{recipientEmail}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No customer email recorded</p>
                )}
              </div>
            </div>

            <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs w-full"
                asChild
              >
                <a href={gmailComposeUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 text-red-500" />
                  <span>Open in Gmail</span>
                </a>
              </Button>
          </div>

          {/* CRM Internal Link (For Team) */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
            <div className="text-xs">
              <p className="font-medium text-muted-foreground flex items-center gap-1">
                <Shield className="h-3 w-3" /> CRM Internal Link (Staff Only)
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleCopyInternal}
            >
              {copiedInternal ? "Copied!" : "Copy Internal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
