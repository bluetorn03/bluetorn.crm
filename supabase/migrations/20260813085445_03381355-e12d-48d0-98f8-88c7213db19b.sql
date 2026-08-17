-- ============ helper: finance visibility ============
create or replace function public.can_view_finance(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_workspace_role(_user_id,'owner') or public.has_workspace_role(_user_id,'manager');
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  type text not null default 'Buyer',
  status text not null default 'Prospect',
  city text,
  currency text not null default 'INR',
  value numeric(14,2) not null default 0,
  tags text[] not null default '{}',
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy customers_rw on public.customers for all to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()))
  with check (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()));

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  location text,
  type text not null default 'Apartment',
  status text not null default 'Available',
  price numeric(14,2) not null default 0,
  currency text not null default 'INR',
  bedrooms integer,
  area_sqft integer,
  image_url text,
  description text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;
alter table public.properties enable row level security;
create policy properties_rw on public.properties for all to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()))
  with check (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()));

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  source text not null default 'Manual Entry',
  campaign text,
  external_id text,
  status text not null default 'New',
  requirement text,
  budget numeric(14,2) not null default 0,
  currency text not null default 'INR',
  score integer not null default 50,
  next_follow_up timestamptz,
  received_at timestamptz not null default now(),
  assigned_to uuid references auth.users(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy leads_rw on public.leads for all to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()))
  with check (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()));

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text,
  created_at timestamptz not null default now()
);
grant select, insert on public.lead_activities to authenticated;
grant all on public.lead_activities to service_role;
alter table public.lead_activities enable row level security;
create policy lead_activities_rw on public.lead_activities for all to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()))
  with check (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'Medium',
  status text not null default 'Open',
  assigned_to uuid references auth.users(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy tasks_rw on public.tasks for all to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()))
  with check (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()));

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  type text not null default 'Meeting',
  status text not null default 'Scheduled',
  start_at timestamptz not null,
  end_at timestamptz,
  location text,
  notes text,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.calendar_events to authenticated;
grant all on public.calendar_events to service_role;
alter table public.calendar_events enable row level security;
create policy calendar_events_rw on public.calendar_events for all to authenticated
  using (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()))
  with check (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()));

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  status text not null default 'Draft',
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'INR',
  tax_rate numeric(6,3) not null default 0,
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, invoice_number)
);
grant select, insert, update, delete on public.invoices to authenticated;
grant all on public.invoices to service_role;
alter table public.invoices enable row level security;
create policy invoices_rw on public.invoices for all to authenticated
  using ((workspace_id = public.current_workspace_id() and public.can_view_finance(auth.uid())) or public.is_super_admin(auth.uid()))
  with check ((workspace_id = public.current_workspace_id() and public.can_view_finance(auth.uid())) or public.is_super_admin(auth.uid()));

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_amount numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  position integer not null default 0
);
grant select, insert, update, delete on public.invoice_items to authenticated;
grant all on public.invoice_items to service_role;
alter table public.invoice_items enable row level security;
create policy invoice_items_rw on public.invoice_items for all to authenticated
  using ((workspace_id = public.current_workspace_id() and public.can_view_finance(auth.uid())) or public.is_super_admin(auth.uid()))
  with check ((workspace_id = public.current_workspace_id() and public.can_view_finance(auth.uid())) or public.is_super_admin(auth.uid()));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'INR',
  method text not null default 'Bank Transfer',
  status text not null default 'Received',
  paid_at timestamptz not null default now(),
  reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy payments_rw on public.payments for all to authenticated
  using ((workspace_id = public.current_workspace_id() and public.can_view_finance(auth.uid())) or public.is_super_admin(auth.uid()))
  with check ((workspace_id = public.current_workspace_id() and public.can_view_finance(auth.uid())) or public.is_super_admin(auth.uid()));

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_monthly numeric(12,2) not null default 0,
  currency text not null default 'INR',
  seat_limit integer not null default 10,
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.plans to authenticated, anon;
grant insert, update, delete on public.plans to authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
create policy plans_read on public.plans for select to authenticated, anon using (true);
create policy plans_write on public.plans for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create table public.promo_media (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,
  target text not null default 'All workspaces',
  priority integer not null default 1,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.promo_media to authenticated, anon;
grant insert, update, delete on public.promo_media to authenticated;
grant all on public.promo_media to service_role;
alter table public.promo_media enable row level security;
create policy promo_read on public.promo_media for select to authenticated, anon using (true);
create policy promo_write on public.promo_media for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create table public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
grant select on public.platform_settings to authenticated;
grant insert, update on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
create policy settings_read on public.platform_settings for select to authenticated using (true);
create policy settings_write on public.platform_settings for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create policy audit_insert_scope on public.audit_logs for insert to authenticated
  with check (workspace_id = public.current_workspace_id() or public.is_super_admin(auth.uid()));
grant insert on public.audit_logs to authenticated;

do $$
declare t text;
begin
  foreach t in array array['customers','properties','leads','tasks','calendar_events','invoices','payments','plans','promo_media']
  loop
    execute format('create trigger trg_%s_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

create index idx_customers_ws on public.customers(workspace_id);
create index idx_properties_ws on public.properties(workspace_id);
create index idx_leads_ws on public.leads(workspace_id);
create index idx_leads_assigned on public.leads(assigned_to);
create index idx_tasks_ws on public.tasks(workspace_id);
create index idx_events_ws on public.calendar_events(workspace_id, start_at);
create index idx_invoices_ws on public.invoices(workspace_id);
create index idx_payments_ws on public.payments(workspace_id);
create index idx_lead_activities_lead on public.lead_activities(lead_id);

insert into public.plans (code, name, description, price_monthly, currency, seat_limit, features, sort_order) values
  ('starter','Starter','For small teams getting started with a single pipeline.', 1999,'INR', 5, array['1 workspace','Up to 5 users','Leads, customers, properties','Email support'], 1),
  ('growth','Growth','For growing sales teams that need finance and reporting.', 7999,'INR', 25, array['Up to 25 users','Invoices & payments','Reports & pipeline analytics','Priority support'], 2),
  ('scale','Scale','For multi-team brokerages operating at scale.', 22990,'INR', 100, array['Up to 100 users','Advanced RBAC','Full audit trail','Dedicated success manager'], 3);

insert into public.platform_settings (key, value) values
  ('general', '{"platformName":"BLUETORN CRM","supportEmail":"support@bluetorn.com","defaultCurrency":"INR","defaultTimezone":"Asia/Kolkata","defaultDateFormat":"DD/MM/YYYY","defaultTimeFormat":"12h","defaultSeatLimit":10,"defaultPlan":"Starter"}'::jsonb),
  ('access', '{"allowSelfSignup":false,"requireStrongPasswords":true,"sessionTimeoutMinutes":720,"maintenanceMode":false,"maintenanceMessage":""}'::jsonb);