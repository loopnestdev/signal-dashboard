import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { C } from '../lib/colors';
import { fetchSettings, saveSettings, SettingsSaveError } from '../lib/api';
import { riskPerTrade } from '../lib/risk';
import { supabase } from '../lib/supabase';
import type { AiProvider, SettingsResponse, TradingSettings } from '../types/market';
import { InfoTip } from './InfoTip';

const label = { fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600, color: C.inkMute, textTransform: 'uppercase' as const };

// Form values are kept as strings so a half-typed number ("1.", "") doesn't snap back while editing.
type Path = string;
type FieldSpec = { path: Path; label: string; tip: string; prefix?: string; suffix?: string; step?: number };

const getAt = (o: unknown, path: Path): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], o);

function setAt<T>(o: T, path: Path, value: unknown): T {
  const copy = structuredClone(o) as Record<string, unknown>;
  const parts = path.split('.');
  let cur = copy;
  for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
  cur[parts[parts.length - 1]] = value;
  return copy as T;
}

const SECTIONS: Array<{ title: string; tip: string; fields: FieldSpec[] }> = [
  {
    title: 'Paper accounts',
    tip: 'Each of the three paper books (Signa + flow options, Radon options, shares) starts with this balance, so their results compare fairly.',
    fields: [
      { path: 'paperStartingBalance', label: 'Starting balance per book', prefix: '$', step: 1000, tip: 'Use roughly what you would really put into this strategy on Moomoo, so sizing and "too expensive" skips are realistic.' },
    ],
  },
  {
    title: 'Risk per trade (rules 1.2)',
    tip: 'The most one trade can lose: the premium paid for an option or debit spread, or entry-to-stop distance x shares for stock.',
    fields: [
      { path: 'sizing.fixedRiskUsd', label: 'Fixed risk per trade', prefix: '$', step: 50, tip: 'Used while the book is below the threshold below. At $10k this is 10% per trade, falling as a percentage as the book grows.' },
      { path: 'sizing.fixedUntilBalance', label: 'Switch to % sizing at', prefix: '$', step: 1000, tip: 'From this balance, risk becomes a percentage of the balance. At $40k, 2.5% equals $1,000, so there is no jump.' },
      { path: 'sizing.pctAboveThreshold', label: 'Risk above threshold', suffix: '% of balance', step: 0.1, tip: "Radon's rule: 2.5% of the balance per position." },
      { path: 'sizing.maxPctBelow', label: 'Cap if balance shrinks', suffix: '% of balance', step: 1, tip: 'If the book falls below its start, the fixed risk is cut to this % of the balance, so a losing streak does not snowball.' },
    ],
  },
  {
    title: 'Kelly sizing',
    tip: 'After enough closed trades, size from the book\'s own win rate and payoff (Kelly criterion), never above the risk per trade above.',
    fields: [
      { path: 'sizing.kellyFraction', label: 'Kelly fraction', suffix: 'x Kelly', step: 0.05, tip: 'Half Kelly (0.5) is Radon\'s default; 0.25 is stricter. Full Kelly is not allowed (max 0.5).' },
      { path: 'sizing.kellyMinTrades', label: 'Closed trades before Kelly', suffix: 'trades', step: 1, tip: 'Until a book has this many closed trades, it uses the fixed risk per trade.' },
    ],
  },
  {
    title: 'Options limits (rules 1.3)',
    tip: 'Applied to each options book separately.',
    fields: [
      { path: 'optionsLimits.maxOpenTrades', label: 'Max open trades', suffix: 'trades', step: 1, tip: 'No new trade opens while this many are open; the missed signal is logged as "skipped: limit".' },
      { path: 'optionsLimits.maxOpenRiskPct', label: 'Max total open risk', suffix: '% of balance', step: 5, tip: 'Sum of the risk of all open trades. 50% of $10k = $5,000, i.e. 5 trades at $1,000.' },
      { path: 'optionsLimits.maxPerTicker', label: 'Max open trades per ticker', suffix: 'trades', step: 1, tip: 'Avoids stacking several trades on one stock.' },
    ],
  },
  {
    title: 'Shares book (rules 4)',
    tip: 'Sizing for the shares-only book.',
    fields: [
      { path: 'shares.riskPct', label: 'Risk per trade', suffix: '% of balance', step: 0.1, tip: 'Entry-to-stop distance x shares. 1% of $10k = $100.' },
      { path: 'shares.maxPositionPct', label: 'Max position value', suffix: '% of balance', step: 5, tip: 'Caps how much of the book one stock can take, even when the stop is tight.' },
      { path: 'shares.maxOpenPositions', label: 'Max open positions', suffix: 'positions', step: 1, tip: 'No new position opens while this many are open.' },
    ],
  },
  {
    title: 'Costs (rules 1.5)',
    tip: 'Charged on every paper fill so results are after costs. Set them to your actual Moomoo AU rates.',
    fields: [
      { path: 'costs.optionPerContract', label: 'Options commission', prefix: 'US$', suffix: 'per contract, per leg', step: 0.05, tip: 'Charged on entry and on exit, for each leg of a spread.' },
      { path: 'costs.sharePerOrder', label: 'Shares commission', prefix: 'US$', suffix: 'per order', step: 0.5, tip: 'Charged on entry and on exit.' },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap(s => s.fields);

const PROVIDERS: Array<{ id: AiProvider; name: string; key?: 'gemini' | 'claude'; envVar?: string; note: string }> = [
  { id: 'gemini', name: 'Gemini (default)', key: 'gemini', envVar: 'GEMINI_API_KEY', note: 'Google Gemini Flash-Lite. Lowest cost.' },
  { id: 'claude', name: 'Claude', key: 'claude', envVar: 'ANTHROPIC_API_KEY', note: 'Anthropic Claude Opus 5.5 at low effort.' },
  { id: 'none', name: 'None', note: 'Built-in template text only; no AI calls.' },
];

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function toForm(s: TradingSettings): Record<Path, string> {
  return Object.fromEntries(ALL_FIELDS.map(f => [f.path, String(getAt(s, f.path))]));
}

function fromForm(base: TradingSettings, form: Record<Path, string>, provider: AiProvider): TradingSettings {
  let out = setAt(base, 'ai.provider', provider);
  for (const f of ALL_FIELDS) out = setAt(out, f.path, form[f.path].trim() === '' ? Number.NaN : Number(form[f.path]));
  return out;
}

function Card({ title, tip, children }: { title: string; tip?: string; children: ReactNode }) {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: C.s1 }}>
      <div style={{ ...label, marginBottom: 14 }}>{title}{tip && <InfoTip tip={tip} />}</div>
      {children}
    </div>
  );
}

export function SettingsView({ canEdit, signedIn }: { canEdit: boolean; signedIn: boolean }) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [form, setForm] = useState<Record<Path, string>>({});
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const apply = useCallback((d: SettingsResponse) => {
    setData(d);
    setForm(toForm(d.settings));
    setProvider(d.settings.ai.provider);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        apply(await fetchSettings());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [apply]);

  const draft = useMemo(() => (data ? fromForm(data.settings, form, provider) : null), [data, form, provider]);
  const dirty = Boolean(data && draft && JSON.stringify(draft) !== JSON.stringify(data.settings));

  const save = async () => {
    if (!draft) return;
    setSaving(true); setError(null); setDetails([]); setSaved(false);
    try {
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
      apply(await saveSettings(draft, token));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      if (e instanceof SettingsSaveError) setDetails(e.details);
    } finally {
      setSaving(false);
    }
  };

  const input = { width: 120, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.borderInput}`, background: C.canvas, color: C.ink, fontSize: '13px' };
  const previewBalances = data?.riskPreview.map(p => p.balance) ?? [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            Settings
            {data && (
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', padding: '3px 9px', borderRadius: 9999, color: C.primary, background: C.primaryBg, border: `1px solid ${C.primaryBorder}` }}>
                RULES v{data.rulesVersion} - FROZEN
              </span>
            )}
          </h2>
          <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
            Account sizing, limits and costs for the paper books, and the AI provider for written summaries. Strategy rules are fixed in code.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => data && (setForm(toForm(data.defaults)), setProvider(data.defaults.ai.provider))}
            disabled={!data || !canEdit || saving}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999, padding: '7px 14px', fontSize: '12px', color: C.inkMute, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.5 }}
          >
            Reset to defaults
          </button>
          <button
            onClick={() => { void save(); }}
            disabled={!dirty || !canEdit || saving}
            style={{
              background: dirty && canEdit ? C.primary : C.canvasSoft, color: dirty && canEdit ? C.onPrimary : C.inkMute,
              border: 'none', borderRadius: 9999, padding: '7px 18px', fontSize: '13px', fontWeight: 600,
              cursor: dirty && canEdit && !saving ? 'pointer' : 'default',
            }}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {!canEdit && (
        <div style={{ background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: 10, padding: '10px 14px', color: C.warn, fontSize: '13px', marginBottom: 16 }}>
          {signedIn ? 'Only admins can change settings. You can view them here.' : 'Sign in as an admin to change settings.'}
        </div>
      )}
      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '10px 14px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
          {details.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{details.map(d => <li key={d}>{d}</li>)}</ul>}
        </div>
      )}
      {saved && !dirty && (
        <div style={{ background: C.bullBg, border: `1px solid ${C.bullBorder}`, borderRadius: 10, padding: '10px 14px', color: C.bull, fontSize: '13px', marginBottom: 16 }}>
          Settings saved. They apply to new paper trades; every trade stores the settings it was opened with.
        </div>
      )}

      {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Loading settings...</div>}

      {data && draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="collector-grid">
            {SECTIONS.map(section => (
              <Card key={section.title} title={section.title} tip={section.tip}>
                {section.fields.map(f => (
                  <div key={f.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: C.inkSec }}>{f.label}<InfoTip tip={f.tip} /></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {f.prefix && <span className="tnum" style={{ fontSize: '12px', color: C.inkMute }}>{f.prefix}</span>}
                      <input
                        className="tnum"
                        type="number"
                        inputMode="decimal"
                        step={f.step}
                        disabled={!canEdit}
                        value={form[f.path] ?? ''}
                        onChange={e => { setSaved(false); setForm(prev => ({ ...prev, [f.path]: e.target.value })); }}
                        style={{ ...input, opacity: canEdit ? 1 : 0.7 }}
                        aria-label={f.label}
                      />
                      {f.suffix && <span style={{ fontSize: '12px', color: C.inkMute, minWidth: 0 }}>{f.suffix}</span>}
                    </span>
                  </div>
                ))}
                {section.title.startsWith('Risk per trade') && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ ...label, fontSize: '10px', marginBottom: 6 }}>
                      Preview: max risk per trade<InfoTip tip="What one trade may lose at each book balance with the values above. Updates as you type." />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
                      {previewBalances.map(b => {
                        const r = riskPerTrade(b, draft.sizing);
                        return (
                          <div key={b} style={{ background: C.canvasSoft, borderRadius: 8, padding: '6px 10px' }}>
                            <div className="tnum" style={{ fontSize: '11px', color: C.inkMute }}>at {money(b)}</div>
                            <div className="tnum" style={{ fontSize: '13px', color: C.ink, fontWeight: 600 }}>
                              {Number.isFinite(r) ? money(r) : '-'} <span style={{ fontSize: '11px', color: C.inkMute, fontWeight: 400 }}>{Number.isFinite(r) ? `${(r / b * 100).toFixed(1)}%` : ''}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card
            title="AI provider for written summaries"
            tip="Writes the market briefing and, later, plain-English trade explanations and weekly summaries. It never decides trades: entries and exits come only from the frozen rules."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PROVIDERS.map(p => {
                const hasKey = p.key ? data.aiKeys[p.key] : true;
                return (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, flexWrap: 'wrap',
                    border: `1px solid ${provider === p.id ? C.primaryBorder : C.border}`, background: provider === p.id ? C.primaryBg : 'transparent',
                    cursor: canEdit ? 'pointer' : 'default',
                  }}>
                    <input type="radio" name="ai-provider" checked={provider === p.id} disabled={!canEdit} onChange={() => { setSaved(false); setProvider(p.id); }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: C.ink, minWidth: 120 }}>{p.name}</span>
                    <span style={{ fontSize: '12px', color: C.inkSec, flex: 1, minWidth: 180 }}>{p.note}</span>
                    {p.key && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: hasKey ? C.bull : C.warn }}>
                        {hasKey ? 'Key set on server' : `No key - add ${p.envVar} in Railway`}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            {provider !== 'none' && !data.aiKeys[provider] && (
              <div style={{ fontSize: '12px', color: C.warn, marginTop: 10 }}>
                Without a key the app falls back to the built-in template text.
              </div>
            )}
          </Card>

          {data.updatedAt && (
            <div style={{ fontSize: '12px', color: C.inkMute }}>Last saved {new Date(data.updatedAt).toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  );
}
