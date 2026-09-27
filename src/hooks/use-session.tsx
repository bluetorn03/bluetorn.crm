import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSessionAction, logoutAction } from "@/lib/auth.functions";

export type Role = "Owner" | "Manager" | "Employee" | "Super Admin";

export type Permission =
  | "finance.view"
  | "finance.invoices.create"
  | "finance.invoices.edit"
  | "finance.invoices.issue"
  | "finance.invoices.cancel"
  | "finance.payments.record"
  | "finance.payments.edit"
  | "finance.payments.reverse"
  | "finance.print"
  | "finance.download"
  | "finance.share"
  | "finance.export"
  | "finance.reports.view"
  | "view.finance"
  | "create.invoice"
  | "edit.invoice"
  | "issue.invoice"
  | "cancel.invoice"
  | "record.payment"
  | "edit.payment"
  | "reverse.payment"
  | "print.invoice"
  | "download.invoice"
  | "share.invoice"
  | "export.finance"
  | "view.finance_reports"
  | "manage.finance"
  | "view.reports"
  | "manage.team"
  | "manage.settings"
  | "view.allRecords"
  | "manage.properties";

const matrix: Record<Role, Permission[]> = {
  Owner: [
    "finance.view",
    "finance.invoices.create",
    "finance.invoices.edit",
    "finance.invoices.issue",
    "finance.invoices.cancel",
    "finance.payments.record",
    "finance.payments.edit",
    "finance.payments.reverse",
    "finance.print",
    "finance.download",
    "finance.share",
    "finance.export",
    "finance.reports.view",
    "view.finance",
    "create.invoice",
    "edit.invoice",
    "issue.invoice",
    "cancel.invoice",
    "record.payment",
    "edit.payment",
    "reverse.payment",
    "print.invoice",
    "download.invoice",
    "share.invoice",
    "export.finance",
    "view.finance_reports",
    "manage.finance",
    "view.reports",
    "manage.team",
    "manage.settings",
    "view.allRecords",
    "manage.properties",
  ],
  // Finance is disabled by default for Manager and Employee
  Manager: ["view.reports", "manage.team", "view.allRecords", "manage.properties"],
  Employee: ["manage.properties"],
  "Super Admin": [
    "finance.view",
    "finance.invoices.create",
    "finance.invoices.edit",
    "finance.invoices.issue",
    "finance.invoices.cancel",
    "finance.payments.record",
    "finance.payments.edit",
    "finance.payments.reverse",
    "finance.print",
    "finance.download",
    "finance.share",
    "finance.export",
    "finance.reports.view",
    "view.finance",
    "create.invoice",
    "edit.invoice",
    "issue.invoice",
    "cancel.invoice",
    "record.payment",
    "edit.payment",
    "reverse.payment",
    "print.invoice",
    "download.invoice",
    "share.invoice",
    "export.finance",
    "view.finance_reports",
    "manage.finance",
    "manage.settings",
    "view.reports",
    "view.allRecords",
    "manage.team",
    "manage.properties",
  ],
};

export type DbRole = "super_admin" | "owner" | "manager" | "employee";

const roleLabel: Record<DbRole, Role> = {
  super_admin: "Super Admin",
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
};

export type SessionUser = {
  id: string;
  userCode: string;
  name: string;
  email: string;
  phone: string;
  whatsappPhone: string;
  jobTitle: string;
  avatarUrl: string | null;
  isActive: boolean;
};

export type SessionWorkspace = {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  industry: string;
  plan: string;
  status: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  logoUrl: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  gstin?: string | null;
  pan?: string | null;
  state?: string | null;
  stateCode?: string | null;
  website?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  bankIfsc?: string | null;
  invoicePrefix?: string;
  defaultPaymentTermsDays?: number;
  defaultInvoiceNotes?: string | null;
  defaultInvoiceTerms?: string | null;
  seatLimit: number;
};

const emptyUser: SessionUser = {
  id: "",
  userCode: "",
  name: "",
  email: "",
  phone: "",
  whatsappPhone: "",
  jobTitle: "",
  avatarUrl: null,
  isActive: false,
};

const emptyWorkspace: SessionWorkspace = {
  id: "",
  code: "—",
  name: "Loading…",
  legalName: null,
  industry: "",
  plan: "",
  status: "",
  currency: "INR",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "12h",
  logoUrl: null,
  contactEmail: null,
  contactPhone: null,
  address: null,
  gstin: null,
  pan: null,
  state: null,
  stateCode: null,
  website: null,
  bankName: null,
  bankAccountNo: null,
  bankAccountName: null,
  bankIfsc: null,
  invoicePrefix: "INV",
  defaultPaymentTermsDays: 14,
  defaultInvoiceNotes: null,
  defaultInvoiceTerms: null,
  seatLimit: 0,
};

type SessionValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: SessionUser;
  role: Role;
  dbRole: DbRole | null;
  isSuperAdmin: boolean;
  permissions: string[];
  workspace: SessionWorkspace;
  workspaceOptions: SessionWorkspace[];
  setWorkspaceId: (id: string) => void;
  can: (perm: Permission) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionValue["status"]>("loading");
  const [user, setUser] = useState<SessionUser>(emptyUser);
  const [dbRole, setDbRole] = useState<DbRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<SessionWorkspace[]>([]);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await getSessionAction();

      if (!session.authenticated) {
        setStatus("unauthenticated");
        setUser(emptyUser);
        setDbRole(null);
        setPermissions([]);
        setWorkspaces([]);
        setWorkspaceIdState(null);
        return;
      }

      setUser(session.user);
      setDbRole(session.role);
      setPermissions(session.permissions ?? []);
      setWorkspaces(session.workspaces);
      setWorkspaceIdState((current) => {
        if (current && session.workspaces.some((w) => w.id === current)) return current;
        return session.primaryWorkspaceId ?? session.workspaces[0]?.id ?? null;
      });
      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      setUser(emptyUser);
      setDbRole(null);
      setPermissions([]);
      setWorkspaces([]);
      setWorkspaceIdState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await logoutAction();
    setStatus("unauthenticated");
    setUser(emptyUser);
    setDbRole(null);
    setPermissions([]);
    setWorkspaces([]);
    setWorkspaceIdState(null);
  }, [queryClient]);

  const value = useMemo<SessionValue>(() => {
    const role = dbRole ? roleLabel[dbRole] : "Employee";
    const workspace =
      workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? emptyWorkspace;

    return {
      status,
      user,
      role,
      dbRole,
      isSuperAdmin: dbRole === "super_admin",
      permissions,
      workspace,
      workspaceOptions: workspaces,
      setWorkspaceId: setWorkspaceIdState,
      can: (perm: Permission) => {
        // Owner and Super Admin have full access
        if (dbRole === "owner" || dbRole === "super_admin") return true;

        // Check if granted in DB permissions
        if (permissions.includes(perm)) return true;

        // manage.finance umbrella permission check
        if (perm === "manage.finance") {
          return (
            permissions.includes("finance.invoices.create") ||
            permissions.includes("finance.invoices.edit") ||
            permissions.includes("finance.payments.record") ||
            permissions.includes("create.invoice") ||
            permissions.includes("edit.invoice") ||
            permissions.includes("record.payment")
          );
        }

        if (perm === "view.finance") {
          return (
            permissions.includes("finance.view") ||
            permissions.includes("view.finance")
          );
        }

        if (perm === "finance.view") {
          return (
            permissions.includes("finance.view") ||
            permissions.includes("view.finance")
          );
        }

        // Fallback to base role matrix (non-finance permissions)
        return matrix[role]?.includes(perm) ?? false;
      },
      refresh: load,
      signOut,
    };
  }, [status, user, dbRole, permissions, workspaces, workspaceId, load, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
