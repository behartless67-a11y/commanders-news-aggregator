/**
 * Model provider. Ollama only, by choice: local keeps this week's headlines and
 * reporter posts off a third party, which matters because two of the sources
 * they came from (Hogs Haven, ClutchPoints) explicitly disallow AI crawlers in
 * robots.txt — see README. `generate()` is the whole surface a caller uses, so
 * an OpenRouter provider would be a second file exporting the same shape
 * against a different endpoint; not built because it isn't needed yet.
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 16384);

export async function generate({ model, system, prompt, schema, temperature = 0.2 }) {
  let res;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: schema,
        think: false,
        options: { temperature, num_ctx: NUM_CTX },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`could not reach Ollama at ${OLLAMA_HOST} — is \`ollama serve\` running? (${err.message})`);
  }

  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const body = await res.json();
  const raw = body.message?.content || '';
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`model returned invalid JSON (${err.message}): ${raw.slice(0, 200)}`);
  }

  return {
    json,
    raw,
    model,
    evalTokens: body.eval_count ?? null,
    evalSeconds: body.eval_duration ? body.eval_duration / 1e9 : null,
  };
}
