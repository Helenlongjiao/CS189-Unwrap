-- Browser context reported by the SDK: timezone, local time of day, language, browser, OS, device.
alter table sessions add column client jsonb;

-- Surveys written by the language model for one specific friction moment. `context` is exactly
-- what the model was shown, so developers can see why it asked what it asked.
create table generated_surveys (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  session_id    uuid not null references sessions(id) on delete cascade,
  trigger_id    uuid,
  trigger_type  text not null check (trigger_type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual')),
  model         text not null,
  headline      text not null,
  message       text,
  questions     jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 3),
  context       jsonb not null default '{}',
  latency_ms    integer,
  created_at    timestamptz not null default now()
);
create index generated_surveys_session_idx on generated_surveys (session_id);
create index generated_surveys_trigger_idx on generated_surveys (trigger_id);

alter table survey_responses
  add column generated_survey_id uuid references generated_surveys(id) on delete set null;
