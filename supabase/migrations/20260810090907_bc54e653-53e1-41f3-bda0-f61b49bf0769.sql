-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin','owner','manager','employee');
CREATE TYPE public.workspace_status AS ENUM ('active','trial','suspended','inactive');

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ WORKSPACES ============
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text,
  industry text NOT NULL DEFAULT 'Real Estate',
  plan text NOT NULL DEFAULT 'Starter',
  status public.workspace_status NOT NULL DEFAULT 'trial',
  currency text NOT NULL DEFAULT 'INR',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  time_format text NOT NULL DEFAULT '12h',
  logo_url text,
  primary_color text,
  contact_email text,
  contact_phone text,
  address text,
  seat_limit integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workspaces_code ON public.workspaces (upper(code));
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_code text NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  job_title text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_profiles_ws_user_code
  ON public.profiles (workspace_id, upper(user_code)) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX idx_profiles_platform_user_code
  ON public.profiles (upper(user_code)) WHERE workspace_id IS NULL;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = _role
      AND ur.workspace_id IS NOT DISTINCT FROM p.workspace_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace_users(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_workspace_role(_user_id,'owner') OR public.has_workspace_role(_user_id,'manager');
$$;

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_ws_created ON public.audit_logs (workspace_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY "workspaces_select_own" ON public.workspaces FOR SELECT TO authenticated
  USING (id = public.current_workspace_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "workspaces_update_owner" ON public.workspaces FOR UPDATE TO authenticated
  USING ((id = public.current_workspace_id() AND public.has_workspace_role(auth.uid(),'owner')) OR public.is_super_admin(auth.uid()))
  WITH CHECK ((id = public.current_workspace_id() AND public.has_workspace_role(auth.uid(),'owner')) OR public.is_super_admin(auth.uid()));
CREATE POLICY "workspaces_insert_admin" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "workspaces_delete_admin" ON public.workspaces FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "profiles_select_scope" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid()
     OR (workspace_id IS NOT NULL AND workspace_id = public.current_workspace_id())
     OR public.is_super_admin(auth.uid()));
CREATE POLICY "profiles_update_self_or_manager" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()
     OR (workspace_id = public.current_workspace_id() AND public.can_manage_workspace_users(auth.uid()))
     OR public.is_super_admin(auth.uid()))
  WITH CHECK (id = auth.uid()
     OR (workspace_id = public.current_workspace_id() AND public.can_manage_workspace_users(auth.uid()))
     OR public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles_select_scope" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid()
     OR (workspace_id IS NOT NULL AND workspace_id = public.current_workspace_id())
     OR public.is_super_admin(auth.uid()));

CREATE POLICY "audit_select_scope" ON public.audit_logs FOR SELECT TO authenticated
  USING ((workspace_id = public.current_workspace_id() AND public.has_workspace_role(auth.uid(),'owner'))
     OR public.is_super_admin(auth.uid()));