-- Rule engine inputs. When several templates exist for a trigger, the SDK keeps those whose
-- conditions all match the trigger, then picks the highest priority (ties go to the template
-- with more conditions, i.e. the more specific one). Supported conditions:
--   {"urlPattern": "/checkout/*"}                    glob on the page path
--   {"elementTags": ["button", "a"]}                 tag of the element involved
--   {"context": {"kind": ["network"]}}               trigger context field is one of the values
alter table survey_templates
  add column priority   integer not null default 0,
  add column conditions jsonb   not null default '{}' check (jsonb_typeof(conditions) = 'object');

-- A user's answer to (or dismissal of) a micro-survey, linked to the friction event that caused it.
-- trigger_id has no foreign key on purpose: a response can reach the server before the batch that
-- carries its friction event.
create table survey_responses (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  session_id    uuid not null references sessions(id) on delete cascade,
  trigger_id    uuid,
  template_id   uuid references survey_templates(id) on delete set null,
  trigger_type  text not null check (trigger_type in ('rage_click', 'dead_click', 'error', 'form_abandon', 'manual')),
  status        text not null check (status in ('submitted', 'dismissed')),
  auto_opened   boolean not null default true,
  answers       jsonb not null default '{}',
  page_url      text,
  created_at    timestamptz not null default now()
);
create index survey_responses_site_created_idx on survey_responses (site_id, created_at desc);
create index survey_responses_trigger_idx on survey_responses (trigger_id);

-- Follow-up questions that only appear for certain answers ("showIf"), and fallbacks for
-- placeholders that may be missing ({{name|fallback}}).
update survey_templates set questions = '[
  {"id": "reason", "type": "choice", "prompt": "What''s holding you up at “{{context.lastField|this form}}”?", "required": true, "options": [
    {"value": "confusing", "label": "I''m not sure what to enter"},
    {"value": "missing_info", "label": "I don''t have the info handy"},
    {"value": "privacy", "label": "I''m not comfortable sharing this"},
    {"value": "broken", "label": "Something isn''t working"},
    {"value": "break", "label": "Just taking a break"}
  ]},
  {"id": "unclear", "type": "text", "prompt": "What''s unclear about “{{context.lastField|this field}}”?", "required": false,
   "showIf": {"question": "reason", "in": ["confusing"]}},
  {"id": "details", "type": "text", "prompt": "What happened?", "required": false,
   "showIf": {"question": "reason", "in": ["broken", "privacy"]}}
]'
where slug = 'form-abandon-default' and site_id is null;

update survey_templates set questions = '[
  {"id": "kind", "type": "choice", "prompt": "What''s going on?", "required": true, "options": [
    {"value": "lost", "label": "I can''t find what I''m looking for"},
    {"value": "broken", "label": "Something is broken"},
    {"value": "confusing", "label": "Something is confusing"},
    {"value": "idea", "label": "I have a suggestion"}
  ]},
  {"id": "looking_for", "type": "text", "prompt": "What are you looking for?", "required": true,
   "showIf": {"question": "kind", "in": ["lost"]}},
  {"id": "details", "type": "text", "prompt": "Tell us what happened", "required": false,
   "showIf": {"question": "kind", "notIn": ["lost"]}}
]'
where slug = 'manual-default' and site_id is null;

update survey_templates set questions = '[
  {"id": "expected", "type": "choice", "prompt": "What did you expect “{{element.label}}” to do?", "required": true, "options": [
    {"value": "navigate", "label": "Take me somewhere"},
    {"value": "expand", "label": "Open or expand something"},
    {"value": "action", "label": "Complete an action"},
    {"value": "unsure", "label": "I wasn''t sure it was clickable"}
  ]},
  {"id": "goal", "type": "text", "prompt": "What are you trying to get done on this page?", "required": false,
   "showIf": {"question": "expected", "notIn": ["unsure"]}}
]'
where slug = 'dead-click-default' and site_id is null;

-- More specific variants that win over the defaults when their conditions match.
insert into survey_templates (slug, trigger_type, title, priority, conditions, questions) values
(
  'dead-click-disabled', 'dead_click', '“{{element.label}}” isn''t available yet', 10,
  '{"context": {"reason": ["disabled"]}}',
  '[
    {"id": "why", "type": "choice", "prompt": "Do you know why you can''t use “{{element.label}}”?", "required": true, "options": [
      {"value": "no_explanation", "label": "No, nothing tells me why"},
      {"value": "missed_step", "label": "I think I missed a step"},
      {"value": "expected", "label": "Yes, that makes sense"}
    ]},
    {"id": "goal", "type": "text", "prompt": "What were you trying to finish?", "required": false,
     "showIf": {"question": "why", "in": ["no_explanation", "missed_step"]}}
  ]'
),
(
  'error-network', 'error', 'We couldn''t complete that request', 10,
  '{"context": {"kind": ["network"]}}',
  '[
    {"id": "lost_work", "type": "choice", "prompt": "Did you lose anything you were working on?", "required": true, "options": [
      {"value": "yes", "label": "Yes"},
      {"value": "no", "label": "No"},
      {"value": "unsure", "label": "Not sure"}
    ]},
    {"id": "goal", "type": "text", "prompt": "What were you trying to do when “{{element.label|it}}” failed?", "required": false}
  ]'
),
(
  'rage-click-disabled', 'rage_click', '“{{element.label}}” isn''t available yet', 10,
  '{"context": {"disabled": [true]}}',
  '[
    {"id": "why", "type": "choice", "prompt": "Do you know why you can''t use “{{element.label}}”?", "required": true, "options": [
      {"value": "no_explanation", "label": "No, nothing tells me why"},
      {"value": "missed_step", "label": "I think I missed a step"},
      {"value": "expected", "label": "Yes, that makes sense"}
    ]},
    {"id": "goal", "type": "text", "prompt": "What were you trying to finish?", "required": false,
     "showIf": {"question": "why", "in": ["no_explanation", "missed_step"]}}
  ]'
);
