import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password · BLUETORN CRM" },
      { name: "description", content: "Reset your BLUETORN CRM workspace password." },
      { property: "og:title", content: "Reset password · BLUETORN CRM" },
      { property: "og:description", content: "Reset your BLUETORN CRM workspace password." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [step, setStep] = useState<"form" | "loading" | "sent">("form");

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Logo size="lg" showTagline />
        {step === "sent" ? (
          <div className="border-border bg-card elev-1 mt-8 rounded-xl border p-6 text-center">
            <div className="bg-success/12 text-success mx-auto grid h-12 w-12 place-items-center rounded-full">
              <MailCheck className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Reset link sent</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              If the user exists in this workspace, a reset link is on its way. The link expires in
              30 minutes.
            </p>
            <ul className="text-muted-foreground mt-4 space-y-1.5 text-left text-xs">
              <li className="flex gap-2">
                <CheckCircle2 className="text-success h-3.5 w-3.5 shrink-0" /> Workspace owner is
                notified
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="text-success h-3.5 w-3.5 shrink-0" /> Existing sessions
                stay active until reset
              </li>
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link to="/">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setStep("loading");
              window.setTimeout(() => setStep("sent"), 900);
            }}
          >
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Forgot password</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Enter your workspace code and user ID and we'll send a reset link to the registered
                email.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws">Workspace Code</Label>
              <Input id="ws" defaultValue="BT-RE-1042" className="h-11 uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uid">User ID</Label>
              <Input id="uid" placeholder="your user id" className="h-11" />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={step === "loading"}>
              {step === "loading" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending link…
                </>
              ) : (
                "Send reset link"
              )}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
              </Link>
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
