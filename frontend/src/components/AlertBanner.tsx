import { C } from '../lib/colors';
import type { Alert } from '../types/market';

interface Props { alerts: Alert[] }

export function AlertBanner({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alerts.map((a, i) => {
        const bg    = a.severity === 'danger' ? C.bearBg    : a.severity === 'warning' ? C.warnBg    : C.primaryBg;
        const bord  = a.severity === 'danger' ? C.bearBorder: a.severity === 'warning' ? C.warnBorder: C.primaryBorder;
        const color = a.severity === 'danger' ? C.bear      : a.severity === 'warning' ? C.warn      : C.primary;
        const icon  = a.severity === 'danger' ? '⚠' : a.severity === 'warning' ? '⚑' : 'ℹ';
        return (
          <div
            key={i}
            style={{
              background: bg, border: `1px solid ${bord}`,
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}
          >
            <span style={{ color, fontSize: '14px', flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <div>
              <span style={{ fontSize: '13px', color, fontWeight: 500 }}>{a.type} — </span>
              <span style={{ fontSize: '13px', color: C.inkSec }}>{a.message}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
