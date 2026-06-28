import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { C } from '../lib/colors';

function SRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: C.inkMute, letterSpacing: '0.04em', paddingTop: 2 }}>{label}</div>
      <div>
        <div style={{ fontSize: '12px', color: C.inkSec as string, lineHeight: 1.5 }}>{value}</div>
        {sub && <div style={{ fontSize: '11px', color: C.inkMute as string, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ScoreRow({ factor, score, note }: { factor: string; score: string; note: string }) {
  const col = score.startsWith('+') ? C.bull : score.startsWith('-') ? C.bear : C.warn;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 56px 1fr', gap: 10, padding: '5px 0', borderBottom: `1px solid ${C.border}`, alignItems: 'baseline' }}>
      <div style={{ fontSize: '12px', color: C.inkSec as string }}>{factor}</div>
      <div className="tnum" style={{ fontSize: '12px', fontWeight: 700, color: col as string }}>{score}</div>
      <div style={{ fontSize: '11px', color: C.inkMute as string }}>{note}</div>
    </div>
  );
}

function RuleRow({ rule, when }: { rule: string; when: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: '12px', color: C.inkSec as string }}>{rule}</div>
      <div style={{ fontSize: '11px', color: C.inkMute as string }}>{when}</div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: C.inkMute as string, marginTop: 14, marginBottom: 4 }}>
      {text}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '11px', color: C.inkMute as string, background: C.canvasSoft as string, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', lineHeight: 1.6, marginTop: 10 }}>
      {children}
    </div>
  );
}

const SECTIONS = [
  {
    id: 'gex-101',
    title: 'Gamma Exposure (GEX) — 101',
    subtitle: 'What dealers are positioned to do as price moves',
    content: (
      <div>
        <Label text="WHAT IS GEX" />
        <p style={{ fontSize: '12px', color: C.inkSec as string, lineHeight: 1.6, margin: '0 0 10px' }}>
          Gamma Exposure (GEX) measures how much options delta dealers (market makers) must hedge per $1 move in the underlying. Because dealers are counterparties to most retail and institutional options trades, their hedging activity becomes a real force on the stock price.
        </p>

        <Label text="THE TWO REGIMES" />
        <SRow
          label="Positive GEX (green)"
          value="Dealers are net long gamma → they sell when price rises, buy when price falls."
          sub="Effect: moves are dampened. Price tends to pin, mean-revert, and stay in range. Lower vol."
        />
        <SRow
          label="Negative GEX (red)"
          value="Dealers are net short gamma → they sell when price falls, buy when price rises (same direction)."
          sub="Effect: moves are amplified. Trending behavior, breakouts, vol spikes. Do NOT buy negative GEX levels expecting a bounce."
        />

        <Label text="KEY STRUCTURAL LEVELS" />
        <SRow label="Gamma Flip" value="The price where dealer net gamma crosses zero. Above = positive regime (calm). Below = negative regime (volatile)." />
        <SRow label="Call Wall" value="Strike with the most positive GEX above price. Dealers dampen all rallies into this level — strongest resistance." />
        <SRow label="Put Wall" value="Strike with largest GEX concentration below price. Reference floor — not always support, depends on sign." />
        <SRow label="Net GEX" value="Sum of all dealer gamma across all strikes. Positive = overall dampening market. Negative = overall amplifying market." />

        <Note>
          <strong style={{ color: C.bear as string }}>Critical rule:</strong> A red (negative GEX) dot below current price is <strong>NOT support</strong>. If price falls to that level, dealers amplify the decline — do not buy that dip. Reduce or hedge instead.
        </Note>
      </div>
    ),
  },
  {
    id: 'gex-trade',
    title: 'Spot Trading with GEX',
    subtitle: 'Entry floors, exit ceilings, stop at the flip',
    content: (
      <div>
        <Label text="4-STEP FRAMEWORK" />
        <SRow
          label="Step 1 — Regime"
          value="Check above / below gamma flip."
          sub="Above flip = positive gamma → safer to be long. Below flip = negative gamma → reduce or short on bounces."
        />
        <SRow
          label="Step 2 — Entry floor (LONG)"
          value="Find the nearest positive GEX level BELOW current price."
          sub="Dealers mechanically buy when price dips to a positive GEX strike — that's your low-risk entry zone. Buy in a tight range around that strike."
        />
        <SRow
          label="Step 3 — Exit ceiling (SELL)"
          value="Use Call Wall as primary target, else nearest positive GEX above."
          sub="Start scaling out 1–1.5% before the Call Wall. Dealers begin selling before price actually reaches it."
        />
        <SRow
          label="Step 4 — Stop loss"
          value="Set stop just below the gamma flip."
          sub="If price closes below flip, regime changes. Dealers switch from dampening to amplifying → your long thesis is broken. Exit immediately."
        />

        <Label text="LONG SETUP (above flip)" />
        <SRow label="Entry zone" value="Dip toward positive GEX floor below price ± 1%." />
        <SRow label="Stop" value="Just below gamma flip (0.5–1% buffer)." sub="Hard rule: close below flip = exit. No exceptions." />
        <SRow label="Exit" value="Scale out from 1.5% below Call Wall to the Call Wall itself." />

        <Label text="SHORT SETUP (below flip)" />
        <SRow label="Entry zone" value="Short on bounce toward gamma flip (from below). Enter as price re-tests flip and fails." />
        <SRow label="Stop" value="Just above gamma flip. If price reclaims flip → cover immediately." />
        <SRow label="Exit (cover)" value="Near Put Wall or nearest positive GEX floor below current price." />

        <Note>
          You do <strong>not</strong> need to wait for a daily close to confirm you're above the flip — the flip is a structural level, not a candlestick signal. A daily close confirmation is only needed if price is actively testing the flip boundary back and forth.
        </Note>
      </div>
    ),
  },
  {
    id: 'radon',
    title: "Radon's Dark Pool Flow Detection",
    subtitle: 'Scoring institutional options + dark pool conviction',
    content: (
      <div>
        <Label text="OVERVIEW" />
        <p style={{ fontSize: '12px', color: C.inkSec as string, lineHeight: 1.6, margin: '0 0 10px' }}>
          Adapted from Radon's Dark Pool Flow Detection strategy. Each curated flow event is scored for directional conviction using a multi-factor confluence matrix. The higher the absolute score, the more institutional intent is signaled.
        </p>

        <Label text="SCORING ALGORITHM" />
        <ScoreRow factor="CALL option" score="+2" note="Base bullish direction signal." />
        <ScoreRow factor="PUT option" score="−2" note="Base bearish direction signal." />
        <ScoreRow factor="Bullish sentiment" score="+1" note="Order flow tagged bullish by Signa." />
        <ScoreRow factor="Bearish sentiment" score="−1" note="Order flow tagged bearish." />
        <ScoreRow factor="Sweep (urgency)" score="×1.5" note="Multiplies running score — sweep = someone needs a fill urgently, now." />
        <ScoreRow factor="Vol/OI ratio > 5" score="±1" note="Volume is 5× open interest → new position, not day trade. Adds 1 in the dominant direction." />
        <ScoreRow factor="confirms_signal" score="+2" note="Flow confirms the Signa.ai signal for this ticker." />
        <ScoreRow factor="contradicts_signal" score="−2" note="Flow contradicts the Signa signal — caution, conflicting view." />
        <ScoreRow factor="Mega premium" score="±1" note="Unusually large premium for this ticker — adds in dominant direction." />
        <ScoreRow factor="Near gamma pin" score="±1" note="Strike near a gamma pin level — GEX amplifies the options leverage." />
        <ScoreRow factor="Negative GEX at strike" score="+0.5" note="Dealers short gamma at this strike → any move is amplified → adds to conviction in dominant direction." />

        <Label text="DIRECTION THRESHOLDS" />
        <SRow label="BULLISH" value="Score ≥ +2" />
        <SRow label="BEARISH" value="Score ≤ −2" />
        <SRow label="NEUTRAL" value="−1 < score < +2" sub="Conflicting signals — wait for resolution." />

        <Label text="CONFLUENCE RULE" />
        <SRow
          label="3+ same-direction events"
          value="If 3 or more scored events for the same ticker are all BULLISH (or BEARISH), treat as a high-conviction institutional signal."
          sub="Single events can be noise. Clusters are intent."
        />

        <Note>
          The score is a relative measure, not a target price. Use it to rank events by conviction — higher absolute score = stronger signal, not guaranteed direction.
        </Note>
      </div>
    ),
  },
  {
    id: 'combined',
    title: 'Combined Read — GEX + Options Flow',
    subtitle: 'GEX tells you where. Flow tells you when.',
    content: (
      <div>
        <Label text="SIGNAL MATRIX" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          {[
            { gex: 'Above flip', flow: 'Bullish flow', read: 'Maximum conviction long. Full size entry on dip to GEX floor.', col: C.bull },
            { gex: 'Above flip', flow: 'Bearish flow', read: 'Early warning. Begin reducing longs. Do not add.', col: C.warn },
            { gex: 'Below flip', flow: 'Bullish flow', read: 'Conflicting. Wait for flip reclaim before acting on bullish flow.', col: C.warn },
            { gex: 'Below flip', flow: 'Bearish flow', read: 'Maximum conviction short. Short on bounce to flip. Cover at put wall.', col: C.bear },
            { gex: 'Above flip', flow: 'No flow data', read: 'Use GEX alone. Entry at floor, exit at wall, stop at flip.', col: C.inkMute },
            { gex: 'Unknown regime', flow: 'Strong flow', read: 'Trust the flow conviction score. Size appropriately — no GEX backstop.', col: C.inkMute },
          ].map((r, i) => (
            <div key={i} style={{ background: C.canvasSoft as string, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: C.inkMute as string, letterSpacing: '0.06em', marginBottom: 4 }}>
                {r.gex} · {r.flow}
              </div>
              <div style={{ fontSize: '11px', color: r.col as string, lineHeight: 1.5 }}>{r.read}</div>
            </div>
          ))}
        </div>

        <Label text="TIMING" />
        <RuleRow rule="Flow sweep arrives at a positive GEX level below price" when="Best entry: dealer buying + institutional buying = double floor." />
        <RuleRow rule="Flow sweep arrives near Call Wall" when="Warning: distribution likely. Start reducing, not adding." />
        <RuleRow rule="Flow contradicts_signal but GEX is positive" when="Wait. One side is wrong — smaller size until they agree." />
        <RuleRow rule="Net GEX turns negative + bearish flow appears" when="Regime shift warning. Exit longs before the flip breaks." />

        <Note>
          Position sizing rule: Full size only when GEX regime and flow direction agree. Half size when one signal is missing. Quarter size or no trade when they conflict.
        </Note>
      </div>
    ),
  },
];

export function PlaybookView() {
  const [open, setOpen] = useState<Set<string>>(new Set(['gex-101']));

  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: C.inkMute as string, letterSpacing: '0.08em', marginBottom: 4 }}>
          PLAYBOOK
        </div>
        <div style={{ fontSize: '22px', fontWeight: 600, color: C.ink as string, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Strategy Reference
        </div>
        <div style={{ fontSize: '13px', color: C.inkMute as string }}>
          GEX framework · Radon flow detection · combined trade reads — always accessible.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SECTIONS.map(s => {
          const isOpen = open.has(s.id);
          return (
            <div
              key={s.id}
              style={{
                background: C.canvas as string,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => toggle(s.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 18px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {isOpen
                  ? <ChevronDown size={15} color={C.primary as string} />
                  : <ChevronRight size={15} color={C.inkMute as string} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: isOpen ? C.primary as string : C.ink as string }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: '11px', color: C.inkMute as string, marginTop: 2 }}>
                    {s.subtitle}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: '4px 18px 18px', borderTop: `1px solid ${C.border}` }}>
                  {s.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
