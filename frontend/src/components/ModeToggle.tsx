import { C } from '../lib/colors';
import type { TradingMode } from '../types/market';

interface Props {
  mode: TradingMode;
  onChange: (mode: TradingMode) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '12px', color: C.inkMute, letterSpacing: '0.06em', fontWeight: 400 }}>MODE</span>
      <div style={{
        display: 'flex', background: C.canvasSoft,
        border: `1px solid ${C.border}`, borderRadius: 9999, padding: 3,
        boxShadow: C.s1,
      }}>
        {(['swing', 'day'] as TradingMode[]).map(m => (
          <button
            key={m}
            onClick={() => onChange(m)}
            style={{
              padding: '5px 16px', borderRadius: 9999,
              fontSize: '13px', fontWeight: 400, cursor: 'pointer',
              border: 'none', transition: 'all 0.15s ease',
              background: mode === m ? C.primary : 'transparent',
              color: mode === m ? C.onPrimary : C.inkMute,
              boxShadow: mode === m ? '0 1px 4px rgba(83,58,253,0.25)' : 'none',
            }}
          >
            {m === 'swing' ? '↻ Swing' : '⚡ Day'}
          </button>
        ))}
      </div>
    </div>
  );
}
