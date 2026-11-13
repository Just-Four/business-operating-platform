-- A challenge from the review can be answered "will test it", which sets the test as a task.
-- The task remembers which challenge it came from and whether the test passed.
alter table public.tasks
  add column if not exists source_review_id uuid references public.ai_reviews(id) on delete set null,
  add column if not exists source_challenge int,
  add column if not exists test_passed boolean;
create index if not exists tasks_source_review_idx on public.tasks (source_review_id);
