import { isSupabaseAdminConfigured, selectRows, upsertRows } from './supabaseRest.js';

// Trading rules version these settings apply to (docs/release2-trading-rules.md). Strategy thresholds live in code;
// these are the account-level knobs the rules leave to the user.
export const RULES_VERSION = '1.1';

export type AiProvider = 'gemini' | 'claude' | 'none';

export interface TradingSettings {
  paperStartingBalance: number;
  sizing: {
    fixedRiskUsd: number;        // risk per trade while the balance is below fixedUntilBalance
    fixedUntilBalance: number;   // from here, risk = pctAboveThreshold % of balance
    pctAboveThreshold: number;
    maxPctBelow: number;         // fixed risk never exceeds this % of a shrinking balance
    kellyFraction: number;
    kellyMinTrades: number;
  };
  optionsLimits: {
    maxOpenTrades: number;
    maxOpenRiskPct: number;
    maxPerTicker: number;
  };
  shares: {
    riskPct: number;
    maxPositionPct: number;
    maxOpenPositions: number;
  };
  costs: {
    optionPerContract: number;
    sharePerOrder: number;
  };
  ai: { provider: AiProvider };
}

export const DEFAULT_SETTINGS: TradingSettings = {
  paperStartingBalance: 10_000,
  sizing: { fixedRiskUsd: 1_000, fixedUntilBalance: 40_000, pctAboveThreshold: 2.5, maxPctBelow: 10, kellyFraction: 0.5, kellyMinTrades: 30 },
  optionsLimits: { maxOpenTrades: 5, maxOpenRiskPct: 50, maxPerTicker: 1 },
  shares: { riskPct: 1, maxPositionPct: 20, maxOpenPositions: 8 },
  costs: { optionPerContract: 1, sharePerOrder: 1 },
  ai: { provider: 'gemini' },
};

// [min, max, integer?] per numeric field. Radon bans full Kelly, hence kellyFraction <= 0.5.
const BOUNDS: Record<string, [number, number, boolean?]> = {
  paperStartingBalance: [1_000, 10_000_000],
  'sizing.fixedRiskUsd': [50, 100_000],
  'sizing.fixedUntilBalance': [1_000, 100_000_000],
  'sizing.pctAboveThreshold': [0.1, 10],
  'sizing.maxPctBelow': [1, 25],
  'sizing.kellyFraction': [0.1, 0.5],
  'sizing.kellyMinTrades': [10, 500, true],
  'optionsLimits.maxOpenTrades': [1, 20, true],
  'optionsLimits.maxOpenRiskPct': [5, 100],
  'optionsLimits.maxPerTicker': [1, 3, true],
  'shares.riskPct': [0.1, 5],
  'shares.maxPositionPct': [5, 100],
  'shares.maxOpenPositions': [1, 30, true],
  'costs.optionPerContract': [0, 20],
  'costs.sharePerOrder': [0, 20],
};

const PROVIDERS: AiProvider[] = ['gemini', 'claude', 'none'];

type Plain = Record<string, unknown>;
const isObj = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

// Fills missing fields from defaults, rejects unknown types and out-of-range values. Returns every error, not just the first.
export function validateSettings(input: unknown): { settings: TradingSettings | null; errors: string[] } {
  if (!isObj(input)) return { settings: null, errors: ['settings must be an object'] };
  const errors: string[] = [];
  const merged = structuredClone(DEFAULT_SETTINGS) as unknown as Plain;

  for (const [path, [min, max, integer]] of Object.entries(BOUNDS)) {
    const parts = path.split('.');
    let src: unknown = input;
    for (const p of parts) src = isObj(src) ? src[p] : undefined;
    if (src === undefined) continue;
    if (typeof src !== 'number' || !Number.isFinite(src)) { errors.push(`${path} must be a number`); continue; }
    if (src < min || src > max) { errors.push(`${path} must be between ${min} and ${max}`); continue; }
    if (integer && !Number.isInteger(src)) { errors.push(`${path} must be a whole number`); continue; }
    let dst = merged;
    for (const p of parts.slice(0, -1)) dst = dst[p] as Plain;
    dst[parts[parts.length - 1]] = src;
  }

  const provider = isObj(input.ai) ? input.ai.provider : undefined;
  if (provider !== undefined) {
    if (PROVIDERS.includes(provider as AiProvider)) (merged.ai as Plain).provider = provider;
    else errors.push(`ai.provider must be one of ${PROVIDERS.join(', ')}`);
  }

  const s = merged as unknown as TradingSettings;
  if (s.sizing.fixedRiskUsd > s.paperStartingBalance) errors.push('sizing.fixedRiskUsd cannot exceed the starting balance');

  return errors.length ? { settings: null, errors } : { settings: s, errors: [] };
}

// Max risk for one trade at a given balance (rules section 1.2).
export function riskPerTrade(balance: number, s: TradingSettings['sizing']): number {
  if (balance <= 0) return 0;
  if (balance >= s.fixedUntilBalance) return round2(balance * s.pctAboveThreshold / 100);
  return round2(Math.min(s.fixedRiskUsd, balance * s.maxPctBelow / 100));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const KEY = 'trading';
const CACHE_MS = 60_000;
let cached: { at: number; value: TradingSettings; updatedAt: string | null } | null = null;

export async function getSettings(): Promise<{ settings: TradingSettings; updatedAt: string | null }> {
  if (cached && Date.now() - cached.at < CACHE_MS) return { settings: cached.value, updatedAt: cached.updatedAt };
  let value = DEFAULT_SETTINGS;
  let updatedAt: string | null = null;
  if (isSupabaseAdminConfigured()) {
    try {
      const [row] = await selectRows<{ value: unknown; updated_at: string }>('app_settings', `select=value,updated_at&key=eq.${KEY}`);
      if (row) {
        const { settings } = validateSettings(row.value);
        if (settings) { value = settings; updatedAt = row.updated_at; }
      }
    } catch (err) {
      console.warn('[settings] read failed, using defaults:', err instanceof Error ? err.message : err);
    }
  }
  cached = { at: Date.now(), value, updatedAt };
  return { settings: value, updatedAt };
}

export async function saveSettings(settings: TradingSettings, updatedBy: string): Promise<void> {
  const updatedAt = new Date().toISOString();
  await upsertRows('app_settings', [{ key: KEY, value: settings, updated_at: updatedAt, updated_by: updatedBy }], 'merge', 'key');
  cached = { at: Date.now(), value: settings, updatedAt };
}
