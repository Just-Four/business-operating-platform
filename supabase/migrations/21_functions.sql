-- The seven parts of the business: Leadership, Management, Sales and marketing, Operations, Finance, Legal, HR.
alter table public.processes add column if not exists function text;

update public.roles set department = 'Sales and marketing' where department in ('Sales', 'Marketing');
update public.roles set department = 'HR' where department = 'People';

create table public.function_owners (
  business_id uuid not null references public.businesses(id) on delete cascade,
  function text not null,
  member_id uuid not null references public.team_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_id, function, member_id)
);
create index function_owners_member_idx on public.function_owners (member_id);

alter table public.function_owners enable row level security;

create policy "members can view" on public.function_owners for select to authenticated using (private.is_member(business_id));
create policy "chairman and operator can add" on public.function_owners for insert to authenticated with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can delete" on public.function_owners for delete to authenticated using (private.has_role(business_id, array['chairman','operator']));
