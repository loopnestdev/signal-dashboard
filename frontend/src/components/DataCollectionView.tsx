import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { C } from '../lib/colors';
import { fetchCollectorStatus } from '../lib/api';
import type { CollectorRun, CollectorStatus } from '../types/market';

const JOB_LABELS: Record<string, string> = {
  signals: 'Signa signals',
  darkpool: 'Dark pool prints',
  'flow-alerts': 'Options flow alerts',
  'curated-flow': 'Curated flow',
  'option-chain': 'Option quotes (Yahoo)',
  gex: 'GEX levels',
  rollup: 'Dark pool daily rollup',
};

const STATUS_COLOR: Record<CollectorRun['status'], string> = {
  ok: C.bull,
  partial: C.warn,
  error: C.bear,
  skipped: C.inkMute,
};

const label = { fontSize: '11px', letterSpacing: '0.08em', fontWeight: 600, color: C.inkMute, textTransform: 'uppercase' as const };

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', boxShadow: C.s1 }}>
      <div style={{ ...label, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: CollectorRun['status'] }) {
  const color = STATUS_COLOR[status];
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 9999, color, border: `1px solid ${color}`,
    }}>
      {status}
    </span>
  );
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtInt = (n: number | null) => (n == null ? '-' : n.toLocaleString());

function UsageCard({ usage }: { usage: CollectorStatus['usage'] }) {
  const pct = Math.min(100, (usage.signaToday / usage.limit) * 100);
  const color = usage.signaToday >= usage.limit - usage.reserve ? C.bear : pct >= 60 ? C.warn : C.bull;
  return (
    <Card title={`Signa API calls - ${usage.utcDay} (UTC)`}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="tnum" style={{ fontSize: '26px', fontWeight: 600, color: C.ink }}>{fmtInt(usage.signaToday)}</span>
        <span className="tnum" style={{ fontSize: '13px', color: C.inkMute }}>/ {fmtInt(usage.limit)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 9999, background: C.canvasSoft, marginTop: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
      <div style={{ fontSize: '12px', color: C.inkSec, marginTop: 10, lineHeight: 1.6 }}>
        Collector plan: <span className="tnum">~{fmtInt(usage.collectorEstimatePerDay)}</span> calls per trading day.
        Jobs are skipped once usage reaches <span className="tnum">{fmtInt(usage.limit - usage.reserve)}</span>,
        keeping <span className="tnum">{fmtInt(usage.reserve)}</span> for dashboard browsing.
      </div>
    </Card>
  );
}

function DailyChart({ daily }: { daily: CollectorStatus['daily'] }) {
  if (daily.length === 0) {
    return <div style={{ fontSize: '13px', color: C.inkMute }}>No collection runs yet. The first run happens at the next scheduled slot on a trading day.</div>;
  }
  const max = Math.max(...daily.map(d => d.rows), 1);
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, minWidth: daily.length * 34 }}>
        {daily.map(d => (
          <div key={d.trade_date} title={`${d.trade_date}: ${d.rows.toLocaleString()} rows, ${d.calls} API calls${d.errors ? `, ${d.errors} errors` : ''}`}
            style={{ flex: '1 0 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', height: `${Math.max(2, (d.rows / max) * 90)}%`, background: d.errors ? C.warn : C.primary, borderRadius: 4 }} />
            <span className="tnum" style={{ fontSize: '10px', color: C.inkMute }}>{d.trade_date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataCollectionView() {
  const [status, setStatus] = useState<CollectorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setStatus(await fetchCollectorStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cell = { padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: '13px', color: C.inkSec, textAlign: 'left' as const, whiteSpace: 'nowrap' as const };
  const head = { ...cell, ...label, fontSize: '10px' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: C.ink, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            Data Collection
            {status && (
              <span style={{
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', padding: '3px 9px', borderRadius: 9999,
                color: status.enabled ? C.bull : C.inkMute, background: status.enabled ? C.bullBg : C.canvasSoft,
                border: `1px solid ${status.enabled ? C.bullBorder : C.border}`,
              }}>
                {status.enabled ? 'RECORDING' : 'DISABLED ON THIS SERVER'}
              </span>
            )}
          </h2>
          <p style={{ fontSize: '13px', color: C.inkMute, marginTop: 3, marginBottom: 0 }}>
            Dark pool, options flow, GEX, signals and option quotes recorded each trading day for backtesting
          </p>
        </div>
        <button
          onClick={() => { void load(); }}
          disabled={loading}
          style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 9999,
            padding: '6px 14px', fontSize: '12px', color: C.inkMute,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: C.bearBg, border: `1px solid ${C.bearBorder}`, borderRadius: 10, padding: '12px 16px', color: C.bear, fontSize: '13px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && !status && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: C.inkMute, fontSize: '13px' }}>Loading collector status...</div>
      )}

      {status && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="collector-grid">
            <UsageCard usage={status.usage} />
            <Card title="Rows collected per trading day">
              <DailyChart daily={status.daily} />
            </Card>
          </div>

          <Card title="Scheduled jobs (US Eastern time, trading days)">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={head}>Job</th><th style={head}>Runs at (ET)</th><th style={head}>Last run</th>
                    <th style={head}>Status</th><th style={{ ...head, textAlign: 'right' }}>Rows</th><th style={{ ...head, textAlign: 'right' }}>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {status.jobs.map(j => (
                    <tr key={j.job}>
                      <td style={{ ...cell, color: C.ink, fontWeight: 500 }}>{JOB_LABELS[j.job] ?? j.job}</td>
                      <td className="tnum" style={{ ...cell, fontSize: '12px' }}>{j.slotsEt.join(' ')}</td>
                      <td style={cell}>{j.lastRun ? fmtTime(j.lastRun.started_at) : '-'}</td>
                      <td style={cell}>{j.lastRun ? <StatusPill status={j.lastRun.status} /> : <span style={{ color: C.inkMute }}>never</span>}</td>
                      <td className="tnum" style={{ ...cell, textAlign: 'right' }}>{fmtInt(j.lastRun?.rows_written ?? null)}</td>
                      <td className="tnum" style={{ ...cell, textAlign: 'right' }}>{fmtInt(j.lastRun?.api_calls ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="collector-grid">
            <Card title="Stored history">
              {status.datasets.map(d => (
                <div key={d.table} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}>
                  <span style={{ color: C.inkSec }}>{d.label}</span>
                  <span className="tnum" style={{ color: C.ink, fontWeight: 500 }}>{fmtInt(d.rows)}</span>
                </div>
              ))}
            </Card>
            <Card title={`Tracked symbols (${status.symbols.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {status.symbols.map(s => (
                  <span key={s} className="tnum" style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 9999, background: C.canvasSoft, border: `1px solid ${C.border}`, color: C.inkSec }}>
                    {s}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: C.inkMute, marginTop: 12, lineHeight: 1.5 }}>
                Edit the universe in Supabase: <span className="tnum">signal.tracked_symbols</span> (set active = false to pause a symbol).
              </div>
            </Card>
          </div>

          {status.recentErrors.length > 0 && (
            <Card title="Recent problems">
              {status.recentErrors.map(r => (
                <div key={`${r.job}-${r.started_at}`} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: '12px', flexWrap: 'wrap' }}>
                  <StatusPill status={r.status} />
                  <span style={{ color: C.ink, fontWeight: 500 }}>{JOB_LABELS[r.job] ?? r.job}</span>
                  <span style={{ color: C.inkMute }}>{fmtTime(r.started_at)}</span>
                  <span style={{ color: C.inkSec, wordBreak: 'break-word' }}>{r.message}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
