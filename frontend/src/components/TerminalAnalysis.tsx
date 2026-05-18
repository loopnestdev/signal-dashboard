import { C } from '../lib/colors';

interface Props {
  analysis: string;
  timestamp: string;
}

// ── Signa output parser ───────────────────────────────────────────────────────
interface ParsedSection {
  type: 'title' | 'meta' | 'environment' | 'section-header' | 'consensus' | 'signal' | 'warning' | 'plain';
  content: string;
}

function parseAnalysis(text: string): ParsedSection[] {
  const lines = text.split('\n');
  const out: ParsedSection[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('MARKET ANALYSIS'))          out.push({ type: 'title', content: line });
    else if (line.startsWith('⚠ RISK FACTORS'))      out.push({ type: 'warning', content: line.replace('⚠ RISK FACTORS: ', '') });
    else if (line.startsWith('ENVIRONMENT:'))         out.push({ type: 'environment', content: line.replace('ENVIRONMENT: ', '') });
    else if (line.startsWith('→ '))                  out.push({ type: 'consensus', content: line.slice(2) });
    else if (line.startsWith('▶ '))                  out.push({ type: 'signal', content: line.slice(2) });
    else if (line.endsWith(':') || line.includes('CONSENSUS:') || line.includes('SIGNALS (')) {
      out.push({ type: 'section-header', content: line });
    } else if (line.startsWith('Grade') || line.includes('confidence') || line.includes('Conviction')) {
      out.push({ type: 'meta', content: line });
    } else {
      out.push({ type: 'plain', content: line });
    }
  }
  return out;
}

function isSignaFormat(text: string): boolean {
  return text.includes('MARKET ANALYSIS') || text.includes('SIGNA.AI') || text.includes('MODEL CONSENSUS');
}

// ── Structured renderer for Signa output ─────────────────────────────────────
function StructuredAnalysis({ text }: { text: string }) {
  const sections = parseAnalysis(text);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sections.map((s, i) => {
        switch (s.type) {
          case 'title':
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: C.ink }}>
                  {s.content.replace('MARKET ANALYSIS — SIGNA.AI · ', '')}
                </span>
              </div>
            );
          case 'meta':
            return (
              <div key={i} style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.5 }}>
                {s.content}
              </div>
            );
          case 'warning':
            return (
              <div key={i} style={{
                background: C.warnBg, border: `1px solid ${C.warnBorder}`,
                borderRadius: 7, padding: '8px 12px', margin: '6px 0',
              }}>
                <span style={{ fontSize: '12px', color: C.warn, fontWeight: 400 }}>⚠ Risk Factors: </span>
                <span style={{ fontSize: '12px', color: C.inkSec }}>{s.content}</span>
              </div>
            );
          case 'section-header':
            return (
              <div key={i} style={{
                fontSize: '11px', color: C.inkMute, letterSpacing: '0.06em',
                fontWeight: 400, marginTop: 10, marginBottom: 4, borderTop: `1px solid ${C.border}`,
                paddingTop: 8,
              }}>
                {s.content.toUpperCase()}
              </div>
            );
          case 'consensus':
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '5px 0',
              }}>
                <span style={{ color: C.primary, fontSize: '12px', flexShrink: 0, marginTop: 2 }}>→</span>
                <span style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.5 }}>{s.content}</span>
              </div>
            );
          case 'signal':
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                background: C.canvasSoft, borderRadius: 6,
                padding: '6px 10px', margin: '2px 0',
                border: `1px solid ${C.border}`,
              }}>
                <span style={{ color: C.bull, fontSize: '12px', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.5 }}>{s.content}</span>
              </div>
            );
          case 'environment':
            return (
              <div key={i} style={{
                background: C.primaryBg, border: `1px solid ${C.primaryBorder}`,
                borderRadius: 7, padding: '10px 12px', marginTop: 8,
              }}>
                <div style={{ fontSize: '10px', color: C.inkMute, letterSpacing: '0.06em', marginBottom: 5 }}>
                  MARKET ENVIRONMENT
                </div>
                {s.content.split(' | ').map((chunk, j) => (
                  <div key={j} style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.6 }}>{chunk}</div>
                ))}
              </div>
            );
          default:
            return (
              <div key={i} style={{ fontSize: '13px', color: C.inkSec, lineHeight: 1.6 }}>
                {s.content}
              </div>
            );
        }
      })}
    </div>
  );
}

// ── Plain text renderer (Gemini / template) ────────────────────────────────────
function PlainAnalysis({ text }: { text: string }) {
  return (
    <p style={{
      margin: 0, fontSize: '14px', color: C.inkSec,
      lineHeight: 1.7, fontWeight: 300, maxWidth: 760,
    }}>
      {text}
    </p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TerminalAnalysis({ analysis, timestamp }: Props) {
  const time = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const isSigna = isSignaFormat(analysis);

  return (
    <div style={{
      background: C.canvas, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden', boxShadow: C.s1,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: C.canvasSoft,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: '11px', color: C.primary, fontWeight: 400,
            background: C.primaryBg, border: `1px solid ${C.primaryBorder}`,
            borderRadius: 9999, padding: '2px 10px', letterSpacing: '0.04em',
          }}>
            {isSigna ? 'SIGNA.AI' : 'AI ANALYSIS'}
          </span>
          <span style={{ fontSize: '13px', color: C.inkMute, fontWeight: 300 }}>
            Market Analysis
          </span>
        </div>
        <span style={{ fontSize: '12px', color: C.inkMute }}>{time}</span>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 22px' }}>
        {isSigna
          ? <StructuredAnalysis text={analysis} />
          : <PlainAnalysis text={analysis} />}
      </div>
    </div>
  );
}
