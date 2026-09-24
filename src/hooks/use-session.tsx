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
  | "view.finance"
  | "manage.finance"
  | "view.reports"
  | "manage.team"
  | "manage.settings"
  | "view.allRecords"
  | "manage.properties";

const matrix: Record<Role, Permission[]> = {
  Owner: [
    "view.finance",
    "manage.finance",
    "view.reports",
    "manage.team",
    "manage.settings",
    "view.allRecords",
    "manage.properties",
  ],
  Manager: ["view.finance", "view.reports", "manage.team", "view.allRecords", "manage.properties"],
  Employee: ["manage.properties"],
  "Super Admin": ["manage.settings", "view.reports", "view.allRecords"],
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
  industry: string;
  plan: string;
  status: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  logoUrl: string | null;
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
  industry: "",
  plan: "",
  status: "",
  currency: "INR",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "12h",
  logoUrl: null,
  seatLimit: 0,
};

type SessionValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: SessionUser;
  role: Role;
  dbRole: DbRole | null;
  isSuperAdmin: boolean;
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
  const [workspaces, setWorkspaces] = useState<SessionWorkspace[]>([]);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await getSessionAction();

      if (!session.authenticated) {
        setStatus("unauthenticated");
        setUser(emptyUser);
        setDbRole(null);
        setWorkspaces([]);
        setWorkspaceIdState(null);
        return;
      }

      setUser(session.user);
      setDbRole(session.role);
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
    setWorkspaces([]);
    setWorkspaceIdState(null);
  }, [queryClient]);

  const value = useMemo<SessionValue>(() => {
    const role = dbRole ? roleLabel[dbRole] : "Employee";
    const workspace = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? emptyWorkspace;
    return {
      status,
      user,
      role,
      dbRole,
      isSuperAdmin: dbRole === "super_admin",
      workspace,
      workspaceOptions: workspaces,
      setWorkspaceId: setWorkspaceIdState,
      can: (perm) => matrix[role].includes(perm),
      refresh: load,
      signOut,
    };
  }, [status, user, dbRole, workspaces, workspaceId, load, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
