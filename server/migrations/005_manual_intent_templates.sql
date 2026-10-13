-- A user who opens the widget themselves first picks why (context.intent). These templates answer
-- each intent without assuming something broke; manual-default remains the catch-all.
insert into survey_templates (slug, trigger_type, title, priority, conditions, questions) values
(
  'manual-lost', 'manual', 'Let’s find what you need', 10,
  '{"context": {"intent": ["lost"]}}',
  '[
    {"id": "looking_for", "type": "choice", "prompt": "What are you looking for?", "required": true, "options": [
      {"value": "page", "label": "A specific page"},
      {"value": "feature", "label": "A feature or setting"},
      {"value": "info", "label": "Information or policies"},
      {"value": "other", "label": "Something else"}
    ]},
    {"id": "details", "type": "text", "prompt": "Describe it in a few words and we’ll point the team at it", "required": false}
  ]'
),
(
  'manual-issue', 'manual', 'What went wrong on {{page.title|this page}}?', 10,
  '{"context": {"intent": ["issue"]}}',
  '[
    {"id": "kind", "type": "choice", "prompt": "Which best describes it?", "required": true, "options": [
      {"value": "broken", "label": "Something didn’t work"},
      {"value": "error", "label": "I saw an error"},
      {"value": "slow", "label": "It’s too slow"},
      {"value": "confusing", "label": "It’s confusing"}
    ]},
    {"id": "details", "type": "text", "prompt": "What were you doing right before it happened?", "required": false}
  ]'
),
(
  'manual-question', 'manual', 'Ask us anything', 10,
  '{"context": {"intent": ["question"]}}',
  '[
    {"id": "question", "type": "text", "prompt": "What’s your question or feedback?", "required": true}
  ]'
);
