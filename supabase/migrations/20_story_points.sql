-- How the business works: one customer followed through five moments.
-- One row per moment per business. A moment can be turned into a process.

create table public.story_points (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  moment text not null check (moment in ('find', 'win', 'deliver', 'paid', 'keep')),
  what_happens text,
  who text,
  needs text,
  process_id uuid references public.processes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, moment)
);
create index story_points_business_idx on public.story_points (business_id);

alter table public.story_points enable row level security;

create policy "members can view" on public.story_points for select to authenticated using (private.is_member(business_id));
create policy "chairman and operator can add" on public.story_points for insert to authenticated with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can update" on public.story_points for update to authenticated using (private.has_role(business_id, array['chairman','operator'])) with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can delete" on public.story_points for delete to authenticated using (private.has_role(business_id, array['chairman','operator']));
