create extension if not exists pgcrypto;

-- A website that embeds the SDK. The public key goes in the script tag; it identifies the site,
-- it is not a secret. allowed_origins restricts which origins may send data (empty = any).
create table sites (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  public_key      text not null unique,
  allowed_origins text[] not null default '{}',
  created_at      timestamptz not null default now()
);

-- One browser tab session. The id is generated client-side and kept in sessionStorage.
create table sessions (
  id            uuid primary key,
  site_id       uuid not null references sites(id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  user_agent    text,
  language      text,
  viewport      jsonb,
  referrer      text,
  landing_url   text
);
create index sessions_site_started_idx on sessions (site_id, started_at desc);

-- The user's path: page views, clicks, field focus, submits and errors, in order.
create table interaction_events (
  id           bigserial primary key,
  session_id   uuid not null references sessions(id) on delete cascade,
  site_id      uuid not null references sites(id) on delete cascade,
  type         text not null check (type in ('page_view', 'click', 'focus', 'submit', 'error')),
  url          text not null,
  occurred_at  timestamptz not null,
  data         jsonb not null default '{}'
);
create index interaction_events_session_idx on interaction_events (session_id, occurred_at);

-- A detected friction moment, with a snapshot of the trail that led to it.
create table friction_events (
  id           uuid primary key,
  session_id   uuid not null references sessions(id) on delete cascade,
  site_id      uuid not null references sites(id) on delete cascade,
  type         text not null check (type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual')),
  url          text not null,
  page_title   text,
  element      jsonb,
  context      jsonb not null default '{}',
  trail        jsonb not null default '[]',
  eligible     boolean not null default false,
  record_only  boolean not null default false,
  occurred_at  timestamptz not null,
  received_at  timestamptz not null default now()
);
create index friction_events_site_type_idx on friction_events (site_id, type, occurred_at desc);
create index friction_events_session_idx on friction_events (session_id, occurred_at);

-- Micro-survey templates. site_id null = default template shared by every site; a site-specific
-- template with the same slug overrides it. Prompts may contain {{placeholders}} such as
-- {{element.label}} that the SDK fills from the trigger that caused the survey.
create table survey_templates (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid references sites(id) on delete cascade,
  slug          text not null,
  trigger_type  text not null check (trigger_type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual')),
  title         text not null,
  questions     jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 3),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index survey_templates_site_slug_idx
  on survey_templates (coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
