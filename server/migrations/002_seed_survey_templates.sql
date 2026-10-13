insert into sites (name, public_key) values ('Local development', 'pk_dev_local')
on conflict (public_key) do nothing;

-- Default templates, one per trigger. Each pairs a structured choice (so responses group cleanly
-- by cause) with an open-text question (so theme analysis has the user's own words to work with).
insert into survey_templates (slug, trigger_type, title, questions) values
(
  'rage-click-default', 'rage_click', 'Is “{{element.label}}” giving you trouble?',
  '[
    {"id": "goal", "type": "choice", "prompt": "What were you trying to do?", "required": true, "options": [
      {"value": "navigate", "label": "Go to another page"},
      {"value": "submit", "label": "Submit or save something"},
      {"value": "see_more", "label": "See more details"},
      {"value": "other", "label": "Something else"}
    ]},
    {"id": "outcome", "type": "choice", "prompt": "What happened when you clicked?", "required": true, "options": [
      {"value": "nothing", "label": "Nothing happened"},
      {"value": "slow", "label": "It was too slow"},
      {"value": "unexpected", "label": "Something unexpected happened"}
    ]},
    {"id": "details", "type": "text", "prompt": "Anything else that would help us fix this?", "required": false}
  ]'
),
(
  'dead-click-default', 'dead_click', 'That didn''t seem to do anything',
  '[
    {"id": "expected", "type": "choice", "prompt": "What did you expect “{{element.label}}” to do?", "required": true, "options": [
      {"value": "navigate", "label": "Take me somewhere"},
      {"value": "expand", "label": "Open or expand something"},
      {"value": "action", "label": "Complete an action"},
      {"value": "unsure", "label": "I wasn''t sure it was clickable"}
    ]},
    {"id": "goal", "type": "text", "prompt": "What are you trying to get done on this page?", "required": false}
  ]'
),
(
  'error-default', 'error', 'Sorry, something went wrong',
  '[
    {"id": "blocked", "type": "choice", "prompt": "Did this stop you from finishing what you were doing?", "required": true, "options": [
      {"value": "blocked", "label": "Yes, I''m stuck"},
      {"value": "workaround", "label": "I found a workaround"},
      {"value": "unsure", "label": "Not sure yet"}
    ]},
    {"id": "goal", "type": "text", "prompt": "What were you trying to do when it happened?", "required": false}
  ]'
),
(
  'form-abandon-default', 'form_abandon', 'Need a hand with this form?',
  '[
    {"id": "reason", "type": "choice", "prompt": "What''s holding you up at “{{context.lastField}}”?", "required": true, "options": [
      {"value": "confusing", "label": "I''m not sure what to enter"},
      {"value": "missing_info", "label": "I don''t have the info handy"},
      {"value": "privacy", "label": "I''m not comfortable sharing this"},
      {"value": "broken", "label": "Something isn''t working"},
      {"value": "break", "label": "Just taking a break"}
    ]},
    {"id": "details", "type": "text", "prompt": "Tell us more (optional)", "required": false}
  ]'
),
(
  'manual-default', 'manual', 'How can we help?',
  '[
    {"id": "kind", "type": "choice", "prompt": "What''s going on?", "required": true, "options": [
      {"value": "lost", "label": "I can''t find what I''m looking for"},
      {"value": "broken", "label": "Something is broken"},
      {"value": "confusing", "label": "Something is confusing"},
      {"value": "idea", "label": "I have a suggestion"}
    ]},
    {"id": "details", "type": "text", "prompt": "Tell us what you''re trying to do", "required": false}
  ]'
);
