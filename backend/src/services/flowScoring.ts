export type FlowDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface CuratedFlowEventInner {
  id: string;
  symbol: string;
  option_type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  dte: number;
  premium_size: number;
  volume: number;
  open_interest: number;
  volume_oi_ratio: number;
  is_sweep: boolean;
  is_block: boolean;
  iv: number;
  underlying_price: number;
  signal_type: string;
  sentiment: string;
  unusual_score: number;
  sector: string | null;
  gex_at_strike: number | null;
  timestamp: string;
}

export interface CuratedFlowEvent {
  id: string;
  event_id: string;
  curated_id: string;
  conviction_score: number;
  direction: FlowDirection;
  confirms_signal: boolean | null;
  contradicts_signal: boolean | null;
  near_gamma_pin: boolean;
  near_call_wall: boolean;
  near_put_wall: boolean;
  tag_mega_premium: boolean;
  tag_unusual_vol_oi: boolean;
  tag_earnings_window: boolean;
  rationale_short: string;
  scored_at: string;
  expires_at: string;
  flow_events: CuratedFlowEventInner;
}

export interface ScoredFlowEvent extends CuratedFlowEvent {
  flow_score: number;
  flow_direction: FlowDirection;
}

export interface FlowSummary {
  totalPremium: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  marketBias: FlowDirection;
  avgConviction: number;
}

// Radon-inspired confluence scoring:
// base (CALL/PUT) + sentiment + sweep urgency + vol/OI new position +
// signal confirmation + mega premium + gamma pin + negative GEX amplification
export function scoreFlowEvent(event: CuratedFlowEvent): ScoredFlowEvent {
  const fe = event.flow_events;
  let score = 0;

  score += fe.option_type === 'CALL' ? 2 : -2;

  if (event.direction === 'BULLISH') score += 1;
  else if (event.direction === 'BEARISH') score -= 1;

  if (fe.is_sweep) score *= 1.5;

  if ((fe.volume_oi_ratio ?? 0) > 5) score += score > 0 ? 1 : -1;

  if (event.confirms_signal) score += 2;
  if (event.contradicts_signal) score -= 2;

  if (event.tag_mega_premium) score += score > 0 ? 1 : -1;

  // Gamma pin draws price toward the strike — amplifies the dominant direction
  if (event.near_gamma_pin) score += score > 0 ? 1 : -1;

  // Negative GEX = dealers short gamma, moves amplify
  if (fe.gex_at_strike != null && fe.gex_at_strike < 0) {
    score += score > 0 ? 0.5 : -0.5;
  }

  const flow_direction: FlowDirection =
    score >= 2 ? 'BULLISH' :
    score <= -2 ? 'BEARISH' :
    'NEUTRAL';

  return { ...event, flow_score: Math.round(score * 10) / 10, flow_direction };
}

export function summarizeFlow(events: ScoredFlowEvent[]): FlowSummary {
  const totalPremium = events.reduce((s, e) => s + (e.flow_events.premium_size ?? 0), 0);
  const bullishCount = events.filter(e => e.flow_direction === 'BULLISH').length;
  const bearishCount = events.filter(e => e.flow_direction === 'BEARISH').length;
  const neutralCount = events.length - bullishCount - bearishCount;
  const avgConviction = events.length > 0
    ? Math.round(events.reduce((s, e) => s + e.conviction_score, 0) / events.length)
    : 0;
  const marketBias: FlowDirection =
    bullishCount > bearishCount ? 'BULLISH' :
    bearishCount > bullishCount ? 'BEARISH' :
    'NEUTRAL';

  return { totalPremium, bullishCount, bearishCount, neutralCount, marketBias, avgConviction };
}
