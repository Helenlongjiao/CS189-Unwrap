-- Allow the scored "lost" trigger alongside the existing friction types.
do $$
declare r record;
begin
  for r in
    select rel.relname as table_name, con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and con.contype = 'c'
      and rel.relname in ('friction_events', 'survey_templates', 'survey_responses', 'generated_surveys')
      and pg_get_constraintdef(con.oid) like '%rage_click%'
  loop
    execute format('alter table %I drop constraint %I', r.table_name, r.conname);
  end loop;
end $$;

alter table friction_events
  add constraint friction_events_type_check
  check (type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual', 'lost'));

alter table survey_templates
  add constraint survey_templates_trigger_type_check
  check (trigger_type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual', 'lost'));

alter table survey_responses
  add constraint survey_responses_trigger_type_check
  check (trigger_type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual', 'lost'));

alter table generated_surveys
  add constraint generated_surveys_trigger_type_check
  check (trigger_type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual', 'lost'));

-- Same-origin page index used to guide a visitor from what they typed.
-- Keyed by origin so demo sites on different ports do not share one map.
create table if not exists page_index (
  origin      text not null,
  url         text not null,
  title       text not null default '',
  headings    jsonb not null default '[]',
  links       jsonb not null default '[]',
  controls    jsonb not null default '[]',
  excerpt     text not null default '',
  fetched_at  timestamptz not null default now(),
  primary key (origin, url)
);
