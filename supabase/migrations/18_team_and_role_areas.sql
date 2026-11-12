-- The team (people) is separate from the roles (the hats they wear).
-- A person can hold several roles; a role can be shared; roles sit in an area of the business.

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  email text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index team_members_business_idx on public.team_members (business_id);

create table public.role_assignments (
  role_id uuid not null references public.roles(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, member_id)
);
create index role_assignments_member_idx on public.role_assignments (member_id);
create index role_assignments_business_idx on public.role_assignments (business_id);

alter table public.roles add column if not exists department text;

alter table public.team_members enable row level security;
alter table public.role_assignments enable row level security;

create policy "members can view" on public.team_members for select to authenticated using (private.is_member(business_id));
create policy "chairman and operator can add" on public.team_members for insert to authenticated with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can update" on public.team_members for update to authenticated using (private.has_role(business_id, array['chairman','operator'])) with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can delete" on public.team_members for delete to authenticated using (private.has_role(business_id, array['chairman','operator']));

create policy "members can view" on public.role_assignments for select to authenticated using (private.is_member(business_id));
create policy "chairman and operator can add" on public.role_assignments for insert to authenticated with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can delete" on public.role_assignments for delete to authenticated using (private.has_role(business_id, array['chairman','operator']));

-- Carry over who fills each role today. "A and B" becomes two people.
with names as (
  select distinct r.business_id, btrim(n) as name
  from public.roles r, regexp_split_to_table(r.filled_by, '\s+and\s+|\s*,\s*') as n
  where r.filled_by is not null and btrim(n) <> ''
)
insert into public.team_members (business_id, name) select business_id, name from names;

insert into public.role_assignments (role_id, member_id, business_id)
select distinct r.id, m.id, r.business_id
from public.roles r
cross join lateral regexp_split_to_table(r.filled_by, '\s+and\s+|\s*,\s*') as n
join public.team_members m on m.name = btrim(n) and m.business_id = r.business_id
where r.filled_by is not null;
