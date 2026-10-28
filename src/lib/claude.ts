import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { breakdownPrompt, SYSTEM } from "./prompts";
import type { Breakdown, Opportunity } from "./types";

export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";

export const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
export const getClient = () => (client ??= new Anthropic());

// If a request is declined by a safety classifier, let the API re-run it on
// Anthropic's recommended fallback model instead of returning a refusal.
const supportsFallback = /^claude-(opus-5|fable-5|sonnet-5-5)/.test(MODEL);
export const fallback = () =>
  supportsFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};

export type Effort = "low" | "medium" | "high";

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Turn SDK errors into messages the owner can act on. */
export function explainClaudeError(err: unknown): ClaudeError {
  if (err instanceof ClaudeError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new ClaudeError("Claude rejected the API key. Check ANTHROPIC_API_KEY.", 401);
  if (err instanceof Anthropic.PermissionDeniedError) return new ClaudeError(`This API key can't use ${MODEL}.`, 403);
  if (err instanceof Anthropic.NotFoundError) return new ClaudeError(`Model ${MODEL} wasn't found. Check ANTHROPIC_MODEL.`, 404);
  if (err instanceof Anthropic.RateLimitError) return new ClaudeError("Claude is rate limited right now. Try again in a minute.", 429);
  if (err instanceof Anthropic.BadRequestError) return new ClaudeError(`Claude couldn't process the request: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new ClaudeError("Couldn't reach the Claude API. Check your connection.", 503);
  if (err instanceof Anthropic.APIError) return new ClaudeError(`Claude API error ${err.status ?? ""}: ${err.message}`.trim(), 502);
  return new ClaudeError(err instanceof Error ? err.message : "Unknown error talking to Claude.", 500);
}

const BreakdownSchema = z.object({
  plainEnglish: z.string(),
  workType: z.enum(["service", "product", "mixed"]),
  whoDoesTheWork: z.string(),
  subcontractorSearchTerms: z.array(z.string()),
  pricingStructure: z.string(),
  suggestedLines: z.array(
    z.object({
      description: z.string(),
      unit: z.string().describe("Singular unit, e.g. pickup, meal, month, job"),
      quantityPerPeriod: z.number(),
    }),
  ),
  contractLength: z.string(),
  periods: z.number().nullable(),
  keyRequirements: z.array(z.string()),
  questionsForSubs: z.array(z.string()),
  redFlags: z.array(z.string()),
  difficulty: z.enum(["easy", "moderate", "hard"]),
});

export async function claudeBreakdown(o: Opportunity): Promise<Breakdown> {
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...fallback(),
    output_config: { effort: "medium", format: betaZodOutputFormat(BreakdownSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: breakdownPrompt(o) }],
  });
  if (res.stop_reason === "refusal") throw new ClaudeError("Claude declined to analyze this notice.", 422);
  if (!res.parsed_output) throw new ClaudeError("Claude's breakdown came back incomplete. Try again.", 502);
  return { ...res.parsed_output, source: "claude" };
}

export type DraftEvent = { type: "text"; text: string } | { type: "error"; message: string };

/**
 * Stream a Markdown draft. If a fallback model takes over mid-stream it
 * continues from the partial text, so the deltas stay valid as-is.
 */
export async function* streamDraft(prompt: string, effort: Effort, signal?: AbortSignal): AsyncGenerator<DraftEvent> {
  const stream = getClient().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64000,
      ...fallback(),
      output_config: { effort },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") yield { type: "error", message: "Claude declined to write this draft." };
  else if (final.stop_reason === "max_tokens") yield { type: "error", message: "The draft was cut off before it finished." };
}
