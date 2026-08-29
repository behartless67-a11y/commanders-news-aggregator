/**
 * Cloud model provider for the weekly digest and live game-day blog, via
 * Amazon Bedrock.
 *
 * Uses `AnthropicBedrockMantle` (Messages-API Bedrock endpoint), not the
 * legacy bedrock-runtime InvokeModel client. AWS credentials resolve the
 * normal SDK way (env vars / role) — nothing Bedrock-specific to configure
 * beyond AWS_REGION.
 *
 * Forces the response through a single tool call rather than parsing free
 * text as JSON — `tool_use.input` arrives pre-parsed against `input_schema`,
 * so there's no "model returned invalid JSON" failure mode to handle the way
 * provider.js had to for Ollama's plain-text format. (`strict: true` would
 * make that schema match guaranteed rather than reliable-in-practice, but
 * Bedrock's Messages endpoint rejects it — "tools.0.custom.strict: Extra
 * inputs are not permitted" — confirmed 2026-08-22; drop it if a future
 * Bedrock SDK/API update adds support.)
 *
 * Tool_use becomes unreliable on large corpora (400+ entries / 16k+ tokens):
 * Sonnet 5 leaks thread bodies into XML parameter markup inside the JSON
 * instead of returning a clean array. The corpus is now capped in select.js
 * (MAX_CORPUS_ARTICLES / MAX_CORPUS_POSTS) so the prompt stays under ~8k
 * tokens where tool_use is reliable.
 */
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const LIVE_BLOG_MODEL = process.env.LIVE_BLOG_MODEL || 'anthropic.claude-sonnet-5';
const TOOL_NAME = 'write_recap';

let client;
function getClient() {
  if (!client) client = new AnthropicBedrockMantle({ awsRegion: AWS_REGION });
  return client;
}

/**
 * Tool-use path — reliable for the live blog where the schema is flat and
 * the corpus is small. The digest/preview use `generateText()` below instead.
 */
export async function generate({ system, prompt, schema, model = LIVE_BLOG_MODEL }) {
  const response = await getClient().messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
    tools: [
      {
        name: TOOL_NAME,
        description: 'Write the structured recap described in the system prompt.',
        input_schema: schema,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
  if (!toolUse) {
    throw new Error(`model did not return the expected tool call (stop_reason: ${response.stop_reason})`);
  }

  return {
    json: toolUse.input,
    raw: JSON.stringify(toolUse.input),
    model,
    evalTokens: response.usage?.output_tokens ?? null,
    evalSeconds: null,
  };
}

/**
 * Plain-text structured output path for the digest and preview — avoids
 * tool_use entirely because Bedrock Sonnet 5 consistently returns complex
 * array fields as XML/CDATA strings regardless of schema type when the
 * system prompt is long. Instead we ask for a specific delimited text format
 * and parse it ourselves — simpler and more reliable at any corpus size.
 *
 * Returns the same `{json, raw, model}` shape as `generate()` so the rest of
 * the pipeline (sanitize, validate, review) works unchanged.
 */
export async function generateText({ system, prompt, model = LIVE_BLOG_MODEL }) {
  const textPrompt = `${prompt}

Format your response EXACTLY like this, with no other text before or after:

HEADLINE: [one-line headline]
LEDE: [one paragraph lede]

THREAD
TITLE: [short label]
CITES: [comma-separated source numbers, e.g. 1, 5, 12]
BODY: [3-5 sentence paragraph]

THREAD
TITLE: [short label]
CITES: [comma-separated source numbers]
BODY: [3-5 sentence paragraph]

(repeat THREAD blocks for each storyline, 4 to 7 total)`;

  const response = await getClient().messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: textPrompt }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text || '';

  // Parse the structured text into the standard digest JSON shape.
  const headline = (text.match(/^HEADLINE:\s*(.+)/m) || [])[1]?.trim() || '';
  const lede = (text.match(/^LEDE:\s*(.+)/m) || [])[1]?.trim() || '';

  const threadBlocks = [...text.matchAll(/^THREAD\s*\nTITLE:\s*(.+)\nCITES:\s*(.*)\nBODY:\s*([\s\S]+?)(?=\n\nTHREAD|\s*$)/gm)];
  const threads = threadBlocks.map((m) => ({
    title: m[1].trim(),
    cites: m[2].split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n)),
    body: m[3].trim(),
  }));

  const json = { headline, lede, threads };
  return {
    json,
    raw: text,
    model,
    evalTokens: response.usage?.output_tokens ?? null,
    evalSeconds: null,
  };
}
