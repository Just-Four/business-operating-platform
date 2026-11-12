-- Which role each role reports to, so the roles can be drawn as a chart.
alter table public.roles add column if not exists reports_to uuid references public.roles(id) on delete set null;
create index if not exists roles_reports_to_idx on public.roles (reports_to);
