import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { AiProvider } from '../lib/settings.js';

// Short narrative text only (market briefing, trade explanations). Trading decisions never come from these models.
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const CLAUDE_MODEL = 'claude-opus-5-5';

export function providerKeyStatus(): Record<'gemini' | 'claude', boolean> {
  return { gemini: Boolean(process.env.GEMINI_API_KEY), claude: Boolean(process.env.ANTHROPIC_API_KEY) };
}

let gemini: GoogleGenAI | null = null;
let claude: Anthropic | null = null;

async function viaGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  gemini ??= new GoogleGenAI({ apiKey });
  const res = await gemini.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
  return res.text?.trim() || null;
}

// Low effort: a three-sentence briefing gains nothing from deep reasoning, and effort is the main cost lever.
// Server-side fallbacks re-run a safety-classifier refusal on another model inside the same call.
async function viaClaude(prompt: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  claude ??= new Anthropic();
  const res = await claude.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') return null;
  const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
  return text || null;
}

// Returns null when the provider is 'none', its key is missing, or the call fails; callers fall back to a template.
export async function generateText(prompt: string, provider: AiProvider): Promise<string | null> {
  try {
    if (provider === 'gemini') return await viaGemini(prompt);
    if (provider === 'claude') return await viaClaude(prompt);
    return null;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn('[llm] Claude rate limited');
    else if (err instanceof Anthropic.AuthenticationError) console.warn('[llm] Claude API key rejected');
    else if (err instanceof Anthropic.APIError) console.warn(`[llm] Claude API error ${err.status}: ${err.message}`);
    else console.warn(`[llm] ${provider} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
