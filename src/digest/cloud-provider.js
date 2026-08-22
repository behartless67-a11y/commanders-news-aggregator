/**
 * Cloud model provider for the live game-day blog, via Amazon Bedrock —
 * separate from provider.js (Ollama, local-only) on purpose. The weekly
 * digest stays local because nothing about it needs to be fast and its
 * safety model depends on a human reviewing every draft before publish (see
 * README, "Why a human has to click approve"). A live quarter-by-quarter
 * blog can't have that gate — there's no time to review mid-game — so it
 * runs on a cloud model instead and leans on strict, schema-enforced tool
 * use plus tight source-grounding in the prompt to control the risk that
 * gate would otherwise catch. `generate()` matches provider.js's shape
 * (`{system, prompt, schema}` in, `{json, raw, model}` out) so the digest
 * pipeline's validate/review/sanitize helpers can be reused unchanged.
 *
 * Uses `AnthropicBedrockMantle` (Messages-API Bedrock endpoint), not the
 * legacy bedrock-runtime InvokeModel client. AWS credentials resolve the
 * normal SDK way (env vars / role) — nothing Bedrock-specific to configure
 * beyond AWS_REGION.
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
 * Forces the response through a single tool call rather than parsing free
 * text as JSON — `tool_use.input` arrives pre-parsed against `input_schema`,
 * so there's no "model returned invalid JSON" failure mode to handle the way
 * provider.js has to for Ollama's plain-text format. (`strict: true` would
 * make that schema match guaranteed rather than reliable-in-practice, but
 * Bedrock's Messages endpoint rejects it — "tools.0.custom.strict: Extra
 * inputs are not permitted" — confirmed 2026-08-22; drop it if a future
 * Bedrock SDK/API update adds support.)
 */
export async function generate({ system, prompt, schema, model = LIVE_BLOG_MODEL }) {
  const response = await getClient().messages.create({
    model,
    max_tokens: 8192,
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
