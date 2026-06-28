import { describe, it, expect } from 'vitest';
import { scoreFlowEvent, summarizeFlow } from '../../services/flowScoring.js';
import type { CuratedFlowEvent, ScoredFlowEvent } from '../../services/flowScoring.js';

// ── Fixture builder ───────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<{
  option_type: 'CALL' | 'PUT';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  is_sweep: boolean;
  volume_oi_ratio: number;
  confirms_signal: boolean | null;
  contradicts_signal: boolean | null;
  tag_mega_premium: boolean;
  near_gamma_pin: boolean;
  gex_at_strike: number | null;
}>): CuratedFlowEvent {
  return {
    id: 'test-id',
    event_id: 'evt-1',
    curated_id: 'cur-1',
    conviction_score: 75,
    direction: overrides.direction ?? 'BULLISH',
    confirms_signal: overrides.confirms_signal ?? null,
    contradicts_signal: overrides.contradicts_signal ?? null,
    near_gamma_pin: overrides.near_gamma_pin ?? false,
    near_call_wall: false,
    near_put_wall: false,
    tag_mega_premium: overrides.tag_mega_premium ?? false,
    tag_unusual_vol_oi: false,
    tag_earnings_window: false,
    rationale_short: 'test rationale',
    scored_at: '2026-01-01T00:00:00Z',
    expires_at: '2026-06-01T00:00:00Z',
    flow_events: {
      id: 'fe-1',
      symbol: 'AAPL',
      option_type: overrides.option_type ?? 'CALL',
      strike: 200,
      expiry: '2026-06-20',
      dte: 90,
      premium_size: 500_000,
      volume: 1000,
      open_interest: 500,
      volume_oi_ratio: overrides.volume_oi_ratio ?? 2,
      is_sweep: overrides.is_sweep ?? false,
      is_block: false,
      iv: 0.35,
      underlying_price: 195,
      signal_type: 'unusual',
      sentiment: 'bullish',
      unusual_score: 80,
      sector: 'Technology',
      gex_at_strike: overrides.gex_at_strike ?? null,
      timestamp: '2026-01-01T10:00:00Z',
    },
  };
}

// ── scoreFlowEvent ────────────────────────────────────────────────────────────

describe('scoreFlowEvent', () => {
  it('CALL + BULLISH direction = base score +3 → BULLISH', () => {
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH' }));
    expect(result.flow_score).toBe(3);
    expect(result.flow_direction).toBe('BULLISH');
  });

  it('PUT + BEARISH direction = base score -3 → BEARISH', () => {
    const result = scoreFlowEvent(makeEvent({ option_type: 'PUT', direction: 'BEARISH' }));
    expect(result.flow_score).toBe(-3);
    expect(result.flow_direction).toBe('BEARISH');
  });

  it('CALL + BEARISH direction = score +1 → NEUTRAL', () => {
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BEARISH' }));
    expect(result.flow_score).toBe(1);
    expect(result.flow_direction).toBe('NEUTRAL');
  });

  it('PUT + BULLISH direction = score -1 → NEUTRAL', () => {
    const result = scoreFlowEvent(makeEvent({ option_type: 'PUT', direction: 'BULLISH' }));
    expect(result.flow_score).toBe(-1);
    expect(result.flow_direction).toBe('NEUTRAL');
  });

  it('sweep multiplies running score by 1.5', () => {
    // CALL(+2) + BULLISH(+1) = 3 → sweep × 1.5 = 4.5
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', is_sweep: true }));
    expect(result.flow_score).toBe(4.5);
    expect(result.flow_direction).toBe('BULLISH');
  });

  it('high vol/OI ratio (>5) adds 1 in the dominant direction', () => {
    // CALL(+2) + BULLISH(+1) = 3 → vol_oi>5 +1 = 4
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', volume_oi_ratio: 6 }));
    expect(result.flow_score).toBe(4);
  });

  it('high vol/OI ratio adds -1 when score is negative', () => {
    // PUT(-2) + BEARISH(-1) = -3 → vol_oi>5 -1 = -4
    const result = scoreFlowEvent(makeEvent({ option_type: 'PUT', direction: 'BEARISH', volume_oi_ratio: 8 }));
    expect(result.flow_score).toBe(-4);
  });

  it('confirms_signal adds +2', () => {
    // CALL(+2) + BULLISH(+1) + confirms(+2) = 5
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', confirms_signal: true }));
    expect(result.flow_score).toBe(5);
  });

  it('contradicts_signal subtracts 2', () => {
    // CALL(+2) + BULLISH(+1) + contradicts(-2) = 1
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', contradicts_signal: true }));
    expect(result.flow_score).toBe(1);
    expect(result.flow_direction).toBe('NEUTRAL');
  });

  it('tag_mega_premium adds 1 in dominant direction when positive', () => {
    // CALL(+2) + BULLISH(+1) + mega(+1) = 4
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', tag_mega_premium: true }));
    expect(result.flow_score).toBe(4);
  });

  it('near_gamma_pin adds 1 in dominant direction', () => {
    // CALL(+2) + BULLISH(+1) + pin(+1) = 4
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', near_gamma_pin: true }));
    expect(result.flow_score).toBe(4);
  });

  it('negative gex_at_strike adds 0.5 in dominant direction', () => {
    // CALL(+2) + BULLISH(+1) + neg_gex(+0.5) = 3.5
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', gex_at_strike: -500 }));
    expect(result.flow_score).toBe(3.5);
  });

  it('positive gex_at_strike does NOT add any bonus', () => {
    // CALL(+2) + BULLISH(+1) + pos_gex(no bonus) = 3
    const result = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'BULLISH', gex_at_strike: 500 }));
    expect(result.flow_score).toBe(3);
  });

  it('sweep + high vol/OI + confirms: all bonuses stack', () => {
    // CALL(+2) + BULLISH(+1) = 3 → sweep×1.5 = 4.5 → vol_oi(+1) = 5.5 → confirms(+2) = 7.5
    const result = scoreFlowEvent(makeEvent({
      option_type: 'CALL',
      direction: 'BULLISH',
      is_sweep: true,
      volume_oi_ratio: 10,
      confirms_signal: true,
    }));
    expect(result.flow_score).toBe(7.5);
    expect(result.flow_direction).toBe('BULLISH');
  });

  it('score exactly ±2 is BULLISH/BEARISH boundary', () => {
    // CALL(+2) + no other bonuses = +2 → BULLISH
    const pos = scoreFlowEvent(makeEvent({ option_type: 'CALL', direction: 'NEUTRAL' }));
    expect(pos.flow_score).toBe(2);
    expect(pos.flow_direction).toBe('BULLISH');

    // PUT(-2) + no other bonuses = -2 → BEARISH
    const neg = scoreFlowEvent(makeEvent({ option_type: 'PUT', direction: 'NEUTRAL' }));
    expect(neg.flow_score).toBe(-2);
    expect(neg.flow_direction).toBe('BEARISH');
  });

  it('preserves all original event fields in the result', () => {
    const event = makeEvent({ option_type: 'CALL', direction: 'BULLISH' });
    const result = scoreFlowEvent(event);
    expect(result.conviction_score).toBe(75);
    expect(result.flow_events.strike).toBe(200);
    expect(result.flow_events.symbol).toBe('AAPL');
  });
});

// ── summarizeFlow ─────────────────────────────────────────────────────────────

function scored(overrides: Partial<{ flow_score: number; flow_direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; premium: number; conviction: number }>): ScoredFlowEvent {
  const base = makeEvent({});
  return {
    ...base,
    flow_score: overrides.flow_score ?? 3,
    flow_direction: overrides.flow_direction ?? 'BULLISH',
    flow_events: {
      ...base.flow_events,
      premium_size: overrides.premium ?? 500_000,
    },
    conviction_score: overrides.conviction ?? 75,
  };
}

describe('summarizeFlow', () => {
  it('returns zeros for empty input', () => {
    const result = summarizeFlow([]);
    expect(result.bullishCount).toBe(0);
    expect(result.bearishCount).toBe(0);
    expect(result.neutralCount).toBe(0);
    expect(result.totalPremium).toBe(0);
    expect(result.avgConviction).toBe(0);
    expect(result.marketBias).toBe('NEUTRAL');
  });

  it('counts directions correctly', () => {
    const events = [
      scored({ flow_direction: 'BULLISH' }),
      scored({ flow_direction: 'BULLISH' }),
      scored({ flow_direction: 'BEARISH' }),
      scored({ flow_direction: 'NEUTRAL' }),
    ];
    const result = summarizeFlow(events);
    expect(result.bullishCount).toBe(2);
    expect(result.bearishCount).toBe(1);
    expect(result.neutralCount).toBe(1);
    expect(result.marketBias).toBe('BULLISH');
  });

  it('totals premium correctly', () => {
    const events = [
      scored({ premium: 1_000_000 }),
      scored({ premium: 500_000 }),
    ];
    expect(summarizeFlow(events).totalPremium).toBe(1_500_000);
  });

  it('averages conviction across all events', () => {
    const events = [
      scored({ conviction: 80 }),
      scored({ conviction: 60 }),
    ];
    expect(summarizeFlow(events).avgConviction).toBe(70);
  });

  it('marketBias is BEARISH when bears outnumber bulls', () => {
    const events = [
      scored({ flow_direction: 'BEARISH' }),
      scored({ flow_direction: 'BEARISH' }),
      scored({ flow_direction: 'BULLISH' }),
    ];
    expect(summarizeFlow(events).marketBias).toBe('BEARISH');
  });

  it('marketBias is NEUTRAL on a tie', () => {
    const events = [
      scored({ flow_direction: 'BULLISH' }),
      scored({ flow_direction: 'BEARISH' }),
    ];
    expect(summarizeFlow(events).marketBias).toBe('NEUTRAL');
  });
});
