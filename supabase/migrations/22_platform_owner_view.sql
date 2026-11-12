-- The platform's owner can see every account and how far each business has got,
-- and can open a business to read it. Opening adds the owner as a viewer (read only) and is recorded.
-- The owner is named in private.platform_admins. Applied to the live database on 12 Nov 2026;
-- the insert below names the owner by email and is left out of this file on purpose.

create table private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.platform_admins enable row level security;

create table private.admin_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  action text not null check (action in ('opened', 'closed')),
  at timestamptz not null default now()
);
alter table private.admin_views enable row level security;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid())); $$;

create or replace function public.admin_overview()
returns table (
  email text, signed_up timestamptz, confirmed boolean, last_sign_in timestamptz,
  business_id uuid, business_name text, sector text, stage text, planning_route text, business_created timestamptz,
  boxes_filled int, sessions_done int, sessions_total int, last_session timestamptz,
  moments int, people int, processes int, runs int, locked boolean, my_role text
)
language sql stable security definer set search_path = ''
as $$
  select u.email::text, u.created_at, u.email_confirmed_at is not null, u.last_sign_in_at,
    b.id, b.name, b.sector, b.stage, b.planning_route, b.created_at,
    (select count(*)::int from public.canvas_boxes c where c.business_id = b.id and btrim(coalesce(c.answer, '')) <> ''),
    (select count(*)::int from public.programme_sessions s where s.business_id = b.id and s.completed_at is not null),
    (select count(*)::int from public.programme_sessions s where s.business_id = b.id),
    (select max(s.completed_at) from public.programme_sessions s where s.business_id = b.id),
    (select count(*)::int from public.story_points sp where sp.business_id = b.id and btrim(coalesce(sp.what_happens, '')) <> ''),
    (select count(*)::int from public.team_members t where t.business_id = b.id and t.active),
    (select count(*)::int from public.processes p where p.business_id = b.id),
    (select count(*)::int from public.process_runs r where r.business_id = b.id),
    exists (select 1 from public.plan_cycles pc where pc.business_id = b.id and pc.status = 'approved'),
    (select m2.role from public.memberships m2 where m2.business_id = b.id and m2.user_id = (select auth.uid()))
  from auth.users u
  left join public.memberships m on m.user_id = u.id and m.role = 'chairman'
  left join public.businesses b on b.id = m.business_id
  where exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid()))
  order by u.created_at, b.created_at;
$$;

create or replace function public.admin_view_business(p_business uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid())) then
    return false;
  end if;
  insert into public.memberships (business_id, user_id, role) values (p_business, (select auth.uid()), 'viewer')
    on conflict (business_id, user_id) do nothing;
  insert into private.admin_views (user_id, business_id, action) values ((select auth.uid()), p_business, 'opened');
  return true;
end;
$$;

create or replace function public.admin_stop_viewing(p_business uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.platform_admins a where a.user_id = (select auth.uid())) then
    return false;
  end if;
  delete from public.memberships where business_id = p_business and user_id = (select auth.uid()) and role = 'viewer';
  insert into private.admin_views (user_id, business_id, action) values ((select auth.uid()), p_business, 'closed');
  return true;
end;
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_view_business(uuid) from public, anon;
revoke execute on function public.admin_stop_viewing(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_view_business(uuid) to authenticated;
grant execute on function public.admin_stop_viewing(uuid) to authenticated;
