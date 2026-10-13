const SYSTEM_PROMPT = `You are the diagnostic assistant built into a website. The SDK just detected that a visitor hit a problem (or opened help themselves). Write a very short micro-survey that helps the site's developers understand exactly what went wrong.

Rules:
- 1 to 3 questions. The first is multiple choice with 3 to 5 short options. Include exactly one free-text question.
- Make every question specific to this moment: name the page they came from, the exact button or link they used and the item it belonged to (its "in ..." area, e.g. a specific product or flight), and what they were likely trying to do given their route. Never be generic: a question that could be asked on any website is a bad question.
- Use the visitor context naturally where it sharpens the question: part of day and weekday (e.g. "booking for tonight?"), device (e.g. phone vs laptop), region from timezone. Do not state their location as a fact; phrase it lightly.
- Plain, friendly language. No technical jargon, no raw error messages, stack traces, or status codes in questions.
- If element.area is present, the headline and the first question must mention that item by name.
- trigger "manual" means the visitor opened help themselves; details.intent says why. Do not assume anything broke unless intent is "issue", and do not apologize otherwise.
  - intent "lost": help them say what they're looking for. Use their route (pages visited, how long, back-and-forth) to offer likely destinations as options.
  - intent "issue": find out what went wrong on the page they're on and what they were doing just before.
  - intent "question": invite their question; options can be likely topics for this page (e.g. pricing, policies, how something works).
- Never ask for personal data (name, email, phone, address, payment details, passwords).
- headline: at most 60 characters, acknowledges what happened. message: at most 160 characters, empathetic, says the team will use their answer to fix it.

Example. Input: trigger error, details {kind: page, status: 404}, element {label: "View seat map", area: "LAX → Tokyo (HND)"}, route: opened /flights "Flights", clicked "View seat map" in "LAX → Tokyo (HND)", visitor {partOfDay: evening, weekday: Friday, device: mobile}.
Good output: headline "The Tokyo seat map didn't load"; message "Sorry, that link is broken on our end. Your answer goes straight to the team fixing it."; questions: (choice) "Were you checking seats on tonight's LAX → Tokyo flight before booking?" options ["Yes, picking a seat before I book", "I already booked and wanted to change seats", "Just comparing legroom", "Something else"]; (text) "What did you need from the Tokyo seat map that we should show you instead?"
Bad (too generic): "What were you trying to do on this page?"`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'message', 'questions'],
  properties: {
    headline: { type: 'string' },
    message: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'prompt', 'required', 'options'],
        properties: {
          type: { type: 'string', enum: ['choice', 'text'] },
          prompt: { type: 'string' },
          required: { type: 'boolean' },
          options: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

function clip(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function slug(text, fallback) {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return s || fallback;
}

/** Condenses a trigger into what the model needs: what happened, where, and the route that led there. */
export function describeForModel(trigger, client) {
  const start = trigger.trail?.[0]?.at ?? trigger.at;
  const route = (trigger.trail ?? []).slice(-15).map((step) => {
    const d = step.data ?? {};
    const t = `+${Math.max(0, Math.round((step.at - start) / 1000))}s`;
    let path = '';
    try {
      path = new URL(step.url).pathname;
    } catch {
      /* keep empty */
    }
    if (step.type === 'page_view') return `${t} opened ${path} "${clip(d.title, 60)}"`;
    if (step.type === 'click') {
      const area = d.area ? ` in "${clip(d.area, 60)}"` : '';
      return `${t} clicked ${d.tag ?? 'element'} "${clip(d.label, 60)}"${area} on ${path}${d.disabled ? ' (disabled)' : ''}`;
    }
    if (step.type === 'focus') return `${t} focused field "${clip(d.field, 60)}"`;
    if (step.type === 'submit') return `${t} submitted a form on ${path}`;
    if (step.type === 'error') return `${t} error (${d.kind}) on ${path}`;
    return `${t} ${step.type}`;
  });
  const { stack, ...context } = trigger.context ?? {};
  let page = '';
  try {
    page = new URL(trigger.url).pathname;
  } catch {
    /* keep empty */
  }
  return {
    trigger: trigger.type,
    page,
    pageTitle: clip(trigger.title, 100),
    element: trigger.element ?? null,
    details: context,
    route,
    visitor: client ?? {},
  };
}

/** Enforces the survey shape no matter what the model returns. */
export function sanitizeSurvey(raw) {
  const questions = (Array.isArray(raw?.questions) ? raw.questions : [])
    .slice(0, 3)
    .map((q, i) => {
      const prompt = clip(q?.prompt, 200);
      const labels = (Array.isArray(q?.options) ? q.options : []).map((o) => clip(o, 80)).filter(Boolean).slice(0, 5);
      const id = `q${i + 1}`;
      if (q?.type === 'choice' && labels.length >= 2) {
        const seen = new Set();
        const options = labels.map((label, j) => {
          let value = slug(label, `o${j + 1}`);
          if (seen.has(value)) value = `${value}_${j + 1}`;
          seen.add(value);
          return { value, label };
        });
        return { id, type: 'choice', prompt, required: q.required !== false, options };
      }
      return { id, type: 'text', prompt, required: false };
    })
    .filter((q) => q.prompt);
  if (!questions.length) throw new Error('model returned no usable questions');
  return {
    headline: clip(raw?.headline, 80) || 'Something went wrong',
    message: clip(raw?.message, 240),
    questions,
  };
}

/** Returns null when no API key is configured, so the SDK falls back to the stored templates. */
export function createSurveyGenerator({ apiKey, model = 'gpt-4o-mini', timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  if (!apiKey) return null;
  return {
    model,
    async generate(trigger, client) {
      const context = describeForModel(trigger, client);
      const started = Date.now();
      const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: 500,
          response_format: { type: 'json_schema', json_schema: { name: 'micro_survey', strict: true, schema: SCHEMA } },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(context) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const survey = sanitizeSurvey(JSON.parse(data.choices?.[0]?.message?.content ?? '{}'));
      return { ...survey, model: data.model ?? model, context, latencyMs: Date.now() - started };
    },
  };
}
