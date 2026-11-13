-- Every challenge from a review is a task from the moment the review is run, so it shows in the task list,
-- in the count beside the dashboard and as the next thing to do. kind is 'challenge' or 'test'.
alter table public.tasks add column if not exists kind text;
update public.tasks set kind = 'test' where source_review_id is not null and kind is null;

insert into public.tasks (business_id, title, detail, route, status, source_review_id, source_challenge, kind, created_by)
select r.business_id,
  left('Answer the review: ' || (c.value->>'area'), 140),
  (c.value->>'problem') || E'\n\n' || (c.value->>'question') || E'\n\nSmallest test: ' || (c.value->>'smallest_test'),
  'person', 'queued', r.id, (c.ord - 1)::int, 'challenge', r.created_by
from (select distinct on (business_id) * from public.ai_reviews where kind = 'checkpoint' order by business_id, created_at desc) r
cross join lateral jsonb_array_elements(r.content->'challenges') with ordinality c(value, ord)
where not (coalesce(r.responses, '{}'::jsonb) ? ((c.ord - 1)::text))
  and not exists (select 1 from public.tasks t where t.source_review_id = r.id and t.source_challenge = (c.ord - 1)::int and t.kind = 'challenge');
