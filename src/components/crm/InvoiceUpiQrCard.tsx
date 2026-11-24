import { useMemo } from "react";
import { QrCode, Copy, Check, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateUpiUri, generateQrSvg } from "@/lib/upi-qr";
import { formatMoney } from "@/lib/format";

interface InvoiceUpiQrCardProps {
  upiId?: string | null;
  payeeName?: string | null;
  amount: number;
  invoiceNumber: string;
  currency?: string;
  className?: string;
}

export function InvoiceUpiQrCard({
  upiId,
  payeeName,
  amount,
  invoiceNumber,
  currency = "INR",
  className,
}: InvoiceUpiQrCardProps) {
  const [copied, setCopied] = useState(false);

  // If workspace hasn't configured a UPI ID, we don't display the QR code
  if (!upiId) return null;

  const effectivePayee = payeeName || "Merchant";
  const upiUri = useMemo(() => {
    return generateUpiUri({
      upiId,
      payeeName: effectivePayee,
      amount,
      invoiceNumber,
    });
  }, [upiId, effectivePayee, amount, invoiceNumber]);

  const qrSvg = useMemo(() => {
    return generateQrSvg(upiUri, { size: 140 }).svgXml;
  }, [upiUri]);

  const handleCopyUpiId = () => {
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    toast.success("UPI ID copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row items-center gap-4 ${className || ""}`}
    >
      <div
        className="bg-white p-2 rounded-lg border border-border shadow-xs shrink-0 flex items-center justify-center print:border-none"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
        title="Scan with any UPI app to pay"
      />

      <div className="space-y-1.5 min-w-0 flex-1 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
          <Smartphone className="h-3.5 w-3.5" />
          <span>Instant UPI Payment</span>
        </div>

        <p className="text-xs font-bold text-foreground">
          Scan & Pay {formatMoney(amount, currency as any)}
        </p>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Scan using PhonePe, Google Pay, Paytm, Cred, or any BHIM UPI mobile app.
        </p>

        <div className="pt-1 flex items-center justify-center sm:justify-start gap-2">
          <code className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded text-foreground font-semibold">
            {upiId}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground no-print"
            onClick={handleCopyUpiId}
            title="Copy UPI ID"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
