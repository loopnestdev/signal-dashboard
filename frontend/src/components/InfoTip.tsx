import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../lib/colors';

const WIDTH = 260;

// Small "?" badge with an explanation. Hover on desktop, tap on touch screens.
// Rendered through a portal so table overflow and uppercase header styles don't clip or restyle it.
export function InfoTip({ tip }: { tip: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - WIDTH - 8));
    const below = r.top < 140;
    setPos({ top: below ? r.bottom + 6 : r.top - 6, left, below });
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={tip}
        onMouseEnter={open}
        onMouseLeave={() => setPos(null)}
        onFocus={open}
        onBlur={() => setPos(null)}
        // Touch taps fire a synthetic mouseenter before click, so click must open rather than toggle;
        // tapping anywhere else blurs the button and closes it.
        onClick={e => { e.stopPropagation(); open(); }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, marginLeft: 5, padding: 0, borderRadius: '50%',
          border: `1px solid ${C.border}`, background: 'none', color: C.inkMute,
          fontSize: '9px', fontWeight: 600, lineHeight: 1, cursor: 'help',
          verticalAlign: 'middle', flexShrink: 0, fontFamily: 'inherit',
        }}
      >
        ?
      </button>
      {pos && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: WIDTH,
            transform: pos.below ? 'none' : 'translateY(-100%)',
            background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: '8px 11px', fontSize: '12px', fontWeight: 400, lineHeight: 1.5,
            color: C.inkSec, textTransform: 'none', letterSpacing: 'normal', whiteSpace: 'normal',
            boxShadow: C.s2, zIndex: 9999, pointerEvents: 'none', textAlign: 'left',
          }}
        >
          {tip}
        </div>,
        document.body,
      )}
    </>
  );
}
