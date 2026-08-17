REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_workspace_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_workspace_users(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace_users(uuid) TO authenticated, service_role;