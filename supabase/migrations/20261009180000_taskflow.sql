create table public.tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200), description text not null default '',
  section text not null default 'current' check (section in ('current','temporary','life','long_term')),
  task_type text not null default 'other' check (task_type in ('project','chat','personal','study','other')),
  progress smallint not null default 0 check (progress between 0 and 100), notes text not null default '',
  link text check (link is null or link ~* '^https?://'), position integer not null default 0,
  due_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.task_history (
  id uuid primary key default gen_random_uuid(), task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade, title text not null, description text not null default '',
  section text not null, task_type text not null, progress smallint not null check (progress between 0 and 100),
  notes text not null default '', link text, completed_at timestamptz not null default now(), created_at timestamptz not null
);
create index tasks_user_section_position_idx on public.tasks (user_id, section, position, created_at desc);
create index task_history_user_completed_idx on public.task_history (user_id, completed_at desc);
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;
create policy "Users manage their own tasks" on public.tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their own task history" on public.task_history for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create function public.complete_task(p_task_id uuid) returns public.task_history language plpgsql security invoker set search_path = public as $$
declare completed public.task_history;
begin
  insert into public.task_history (task_id,user_id,title,description,section,task_type,progress,notes,link,created_at)
  select id,user_id,title,description,section,task_type,100,notes,link,created_at from public.tasks where id=p_task_id and user_id=(select auth.uid()) returning * into completed;
  if not found then raise exception 'Task not found'; end if;
  delete from public.tasks where id=p_task_id and user_id=(select auth.uid()); return completed;
end; $$;
revoke all on function public.complete_task(uuid) from public, anon;
grant execute on function public.complete_task(uuid) to authenticated;
alter publication supabase_realtime add table public.tasks, public.task_history;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.task_history to authenticated;
