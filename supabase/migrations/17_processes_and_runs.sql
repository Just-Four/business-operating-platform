-- 17_processes_and_runs
-- Build stage, Phase 1: processes made of steps; a run creates its tasks one step at a time
-- from the live procedure; agent steps can be held for a person to check before the next step.

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  purpose text,
  trigger_text text,
  outcome text,
  owner_role_id uuid references public.roles(id) on delete set null,
  version int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.process_steps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  seq int not null,
  title text not null,
  instructions text,
  result text,
  standard text,
  minutes int,
  role_id uuid references public.roles(id) on delete set null,
  route text not null default 'person' check (route = any (array['person','grok_bot','claude','n8n','cheap_model'])),
  fallback_route text check (fallback_route = any (array['person','grok_bot','claude','n8n','cheap_model'])),
  review_required boolean not null default false,
  can_search boolean not null default false,
  assessment jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.process_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  created_at timestamptz not null default now()
);

create table public.process_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  version int not null,
  subject text,
  brief text,
  status text not null default 'running' check (status = any (array['running','complete','stopped'])),
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.tasks
  add column process_run_id uuid references public.process_runs(id) on delete set null,
  add column process_step_id uuid references public.process_steps(id) on delete set null,
  add column step_seq int,
  add column procedure_version int,
  add column review_required boolean not null default false,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column review_note text,
  add column rejections int not null default 0;

alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status = any (array['queued','in_progress','blocked','awaiting_approval','awaiting_review','done','failed','escalated','cancelled']));

create index processes_business_idx on public.processes (business_id);
create index processes_owner_role_idx on public.processes (owner_role_id);
create index process_steps_process_idx on public.process_steps (process_id, seq);
create index process_steps_business_idx on public.process_steps (business_id);
create index process_steps_role_idx on public.process_steps (role_id);
create index process_versions_process_idx on public.process_versions (process_id, version);
create index process_versions_business_idx on public.process_versions (business_id);
create index process_runs_process_idx on public.process_runs (process_id);
create index process_runs_business_idx on public.process_runs (business_id);
create index tasks_process_run_idx on public.tasks (process_run_id);
create index tasks_process_step_idx on public.tasks (process_step_id);

create trigger processes_set_updated_at before update on public.processes for each row execute function private.set_updated_at();
create trigger process_steps_set_updated_at before update on public.process_steps for each row execute function private.set_updated_at();

alter table public.processes enable row level security;
alter table public.process_steps enable row level security;
alter table public.process_versions enable row level security;
alter table public.process_runs enable row level security;

create policy "members can view" on public.processes for select using (private.is_member(business_id));
create policy "chairman and operator can add" on public.processes for insert with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can update" on public.processes for update using (private.has_role(business_id, array['chairman','operator'])) with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can delete" on public.processes for delete using (private.has_role(business_id, array['chairman','operator']));

create policy "members can view" on public.process_steps for select using (private.is_member(business_id));
create policy "chairman and operator can add" on public.process_steps for insert with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can update" on public.process_steps for update using (private.has_role(business_id, array['chairman','operator'])) with check (private.has_role(business_id, array['chairman','operator']));
create policy "chairman and operator can delete" on public.process_steps for delete using (private.has_role(business_id, array['chairman','operator']));

create policy "members can view" on public.process_versions for select using (private.is_member(business_id));
create policy "chairman and operator can add" on public.process_versions for insert with check (private.has_role(business_id, array['chairman','operator']));

create policy "members can view" on public.process_runs for select using (private.is_member(business_id));
create policy "team can update" on public.process_runs for update using (private.has_role(business_id, array['chairman','operator','team_member'])) with check (private.has_role(business_id, array['chairman','operator','team_member']));

-- Creates the task for the first step after p_after in the process's live procedure.
create or replace function private.make_step_task(p_run uuid, p_after int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare r record; proc record; s record; rl record; new_id uuid; n int;
begin
  select * into r from public.process_runs where id = p_run;
  if r.id is null then return null; end if;
  select * into proc from public.processes where id = r.process_id;
  select * into s from public.process_steps where process_id = r.process_id and seq > p_after order by seq limit 1;
  if s.id is null then return null; end if;
  select id into new_id from public.tasks where process_run_id = p_run and process_step_id = s.id and status <> 'cancelled' limit 1;
  if new_id is not null then return new_id; end if;
  select * into rl from public.roles where id = s.role_id;
  select count(*) into n from public.process_steps where process_id = r.process_id;
  insert into public.tasks (business_id, role_id, title, detail, route, fallback_route, review_required,
                            process_run_id, process_step_id, step_seq, procedure_version, created_by)
  values (
    r.business_id, s.role_id,
    s.title || case when r.subject is not null then ' — ' || r.subject else '' end,
    nullif(concat_ws(E'\n\n',
      nullif(s.instructions, ''),
      case when nullif(s.result, '') is not null then 'Result needed: ' || s.result end,
      case when nullif(s.standard, '') is not null then 'Standard it must meet: ' || s.standard end), ''),
    s.route, coalesce(s.fallback_route, rl.fallback_route), s.review_required,
    r.id, s.id, s.seq, proc.version, r.started_by)
  returning id into new_id;
  insert into public.task_events (business_id, task_id, event, actor, detail)
  values (r.business_id, new_id, 'created', 'Procedure: ' || proc.name, 'Step ' || s.seq || ' of ' || n || ', procedure version ' || proc.version);
  return new_id;
end;
$$;

create or replace function private.advance_process_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare cur int; nxt uuid;
begin
  if new.process_run_id is null or new.status is distinct from 'done' or old.status = 'done' then return new; end if;
  if not exists (select 1 from public.process_runs where id = new.process_run_id and status = 'running') then return new; end if;
  select seq into cur from public.process_steps where id = new.process_step_id;
  cur := coalesce(cur, new.step_seq, 0);
  nxt := private.make_step_task(new.process_run_id, cur);
  if nxt is null then
    update public.process_runs set status = 'complete', finished_at = now() where id = new.process_run_id;
  end if;
  return new;
end;
$$;

create trigger tasks_advance_process_run
  after update of status on public.tasks
  for each row when (new.process_run_id is not null)
  execute function private.advance_process_run();

create or replace function public.start_process_run(p_process uuid, p_subject text, p_brief text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare p record; run_id uuid;
begin
  select * into p from public.processes where id = p_process;
  if p.id is null or not private.has_role(p.business_id, array['chairman','operator','team_member']) then
    raise exception 'Not allowed';
  end if;
  if not exists (select 1 from public.process_steps where process_id = p_process) then
    raise exception 'Add at least one step before starting this process';
  end if;
  insert into public.process_runs (business_id, process_id, version, subject, brief, started_by)
  values (p.business_id, p.id, p.version, nullif(btrim(p_subject), ''), nullif(btrim(p_brief), ''), auth.uid())
  returning id into run_id;
  perform private.make_step_task(run_id, 0);
  return run_id;
end;
$$;
revoke all on function public.start_process_run(uuid, text, text) from public, anon;
grant execute on function public.start_process_run(uuid, text, text) to authenticated;

-- External agents: a finished step that needs checking waits for a person instead of going straight to done.
create or replace function public.agent_report_task(p_key text, p_task uuid, p_status text, p_result text, p_cost numeric default 0, p_link text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a record; t record; new_status text; new_route text;
begin
  select * into a from private.agent_for(p_key);
  if a.business_id is null then raise exception 'Invalid or revoked agent key'; end if;
  if p_status not in ('done','failed','blocked') then raise exception 'Status must be done, failed or blocked'; end if;
  select * into t from public.tasks where id = p_task and business_id = a.business_id and route = a.route;
  if t.id is null then raise exception 'Task not found for this agent'; end if;
  new_status := p_status; new_route := t.route;
  if p_status = 'done' and t.review_required then
    new_status := 'awaiting_review';
  end if;
  -- Automatic escalation: a failed task moves to its fallback route
  if p_status = 'failed' and t.fallback_route is not null and t.fallback_route <> t.route then
    new_status := 'escalated'; new_route := t.fallback_route;
  end if;
  update public.tasks set status = new_status, route = new_route, result = p_result, result_link = p_link,
    cost = cost + coalesce(p_cost, 0), updated_at = now() where id = p_task;
  insert into public.task_events (business_id, task_id, event, actor, detail)
  values (a.business_id, p_task,
    case when new_status = 'escalated' then 'escalated to ' || new_route
         when new_status = 'awaiting_review' then 'result ready to check'
         else p_status end,
    a.label, p_result);
  return jsonb_build_object('ok', true, 'status', new_status, 'route', new_route);
end;
$$;
