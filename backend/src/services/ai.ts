import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Decision } from './scoring.js';
import { getSignaSignal, formatSignaMarketAnalysis } from '../lib/signaClient.js';

interface AnalysisInput {
  marketQualityScore: number;
  decision: Decision;
  vix: number;
  regime: string;
  volatilityScore: number;
  trendScore: number;
  breadthScore: number;
  momentumScore: number;
  macroScore: number;
  topSectors: string[];
  bottomSectors: string[];
  tnx: number;
  fedStance: string;
  executionWindowScore: number;
}

function buildPrompt(d: AnalysisInput): string {
  return `You are a professional market risk manager writing a daily briefing for swing traders.

Market data snapshot:
- Decision: ${d.decision.replace('_', ' ')} | Quality Score: ${d.marketQualityScore}/100
- Regime: ${d.regime} | VIX: ${d.vix.toFixed(1)}
- Volatility: ${d.volatilityScore}/100 | Trend: ${d.trendScore}/100 | Breadth: ${d.breadthScore}/100
- Momentum: ${d.momentumScore}/100 | Macro: ${d.macroScore}/100
- Execution Window: ${d.executionWindowScore}/100
- Leading sectors: ${d.topSectors.join(', ')}
- Lagging sectors: ${d.bottomSectors.join(', ')}
- 10Y Treasury: ${d.tnx.toFixed(2)}% | Fed: ${d.fedStance}

Write exactly 3 sentences. Be specific about the regime and what it means for position sizing. Mention the strongest and weakest conditions. Close with one actionable tactical note. Professional tone, no fluff, no bullet points.`;
}

function templateAnalysis(d: AnalysisInput): string {
  const score = d.marketQualityScore;
  const leaders = d.topSectors.slice(0, 2).join(' and ');
  const laggers = d.bottomSectors.slice(-1)[0];

  if (d.decision === 'YES_BUY') {
    return `Market conditions are strongly favorable for swing traders with a quality score of ${score}/100 — the ${d.regime} environment features expanding sector breadth led by ${leaders}. Volatility is ${d.vix < 18 ? 'contained' : 'moderately elevated'} at ${d.vix.toFixed(1)} and trend structure is intact across key moving averages. Deploy full position sizes on A+ breakout setups while managing risk through stops; avoid ${laggers} where relative strength is weakest.`;
  }
  if (d.decision === 'YES_SELL') {
    return `A deteriorating market with a score of ${score}/100 — breadth is collapsing and defensive positioning is warranted with leadership shifting toward ${leaders}. VIX at ${d.vix.toFixed(1)} signals elevated risk, and trend structure is breaking down below key moving average levels. Reduce long exposure aggressively and consider short setups in the weakest sectors, keeping position sizes conservative.`;
  }
  if (d.decision === 'CAUTION') {
    return `Mixed market conditions produce a quality score of ${score}/100 — some pockets of strength in ${leaders} exist but overall breadth and trend momentum are insufficient for aggressive trading. VIX at ${d.vix.toFixed(1)} creates headline risk and the ${d.regime} regime suggests setups are not reliably following through. Trade at half-size, focus exclusively on the highest-quality A+ setups, and be quick to take partial profits.`;
  }
  return `Current market conditions score ${score}/100 — the combination of ${d.regime === 'downtrend' ? 'a clear downtrend' : 'choppy, directionless price action'} and ${d.vix > 25 ? `elevated VIX at ${d.vix.toFixed(1)}` : `weak breadth with only ${d.topSectors.length > 0 ? leaders : 'few sectors'} showing strength`} makes this a poor environment for swing trading. Capital preservation is the primary objective until the market quality score recovers above 60. Stay in cash, tighten stops on any existing positions, and wait for a clear regime change before adding new risk.`;
}

export async function generateAnalysis(input: AnalysisInput): Promise<string> {
  // 1. Try Signa.ai first
  const spySignal = await getSignaSignal('SPY');
  if (spySignal) {
    return formatSignaMarketAnalysis(
      spySignal,
      input.marketQualityScore,
      input.vix,
      input.regime,
      input.topSectors,
      input.bottomSectors,
    );
  }

  // 2. Try Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  const provider = process.env.AI_PROVIDER ?? 'gemini';

  if (!apiKey || provider === 'none') {
    return templateAnalysis(input);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(buildPrompt(input));
    const text = result.response.text().trim();
    return text || templateAnalysis(input);
  } catch {
    return templateAnalysis(input);
  }
}
