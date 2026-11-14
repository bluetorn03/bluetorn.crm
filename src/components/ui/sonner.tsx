import { Toaster as Sonner, toast } from "sonner";
import { formatErrorMessage, isCdnSecurityChallenge } from "@/lib/error-formatter";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Intercept toast.error globally once so all existing callers (mutation callbacks, dialogs, etc.)
// automatically sanitize raw HTML error responses and attach a Refresh action on CDN challenges.
if (typeof window !== "undefined") {
  const originalToastError = toast.error.bind(toast);
  toast.error = ((message: any, data?: any) => {
    const isChallenge = isCdnSecurityChallenge(message);
    const safeMessage =
      typeof message === "string" ||
      message instanceof Error ||
      (typeof message === "object" && message !== null && "message" in message)
        ? formatErrorMessage(message)
        : message;

    let toastOptions = data;
    if (isChallenge && (!toastOptions || !toastOptions.action)) {
      toastOptions = {
        ...toastOptions,
        action: {
          label: "Refresh",
          onClick: () => window.location.reload(),
        },
      };
    }

    return originalToastError(safeMessage, toastOptions);
  }) as typeof toast.error;
}

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
