import { C } from '../lib/colors';
import type { UserProfile } from '../hooks/useAuth';

interface Props {
  pendingUsers: UserProfile[];
  onApprove: (userId: string) => void;
}

export function AdminPanel({ pendingUsers, onApprove }: Props) {
  if (pendingUsers.length === 0) return null;

  return (
    <div style={{
      background: C.warnBg, border: `1px solid ${C.warnBorder}`,
      borderRadius: 12, padding: '16px 20px', marginBottom: 20,
    }}>
      <div style={{
        fontSize: '11px', color: C.warn, letterSpacing: '0.08em',
        fontWeight: 500, marginBottom: 12,
      }}>
        PENDING ACCESS REQUESTS — {pendingUsers.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pendingUsers.map(u => (
          <div
            key={u.id}
            style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '13px', color: C.ink, fontWeight: 400 }}>
                {u.display_name ?? u.email}
              </span>
              <span style={{ fontSize: '12px', color: C.inkMute }}>
                {u.email} · requested {new Date(u.requested_at).toLocaleDateString()}
              </span>
            </div>
            <button
              onClick={() => onApprove(u.id)}
              style={{
                background: C.bull, border: 'none', borderRadius: 9999,
                padding: '5px 16px', fontSize: '12px', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 400,
                flexShrink: 0,
              }}
            >
              Approve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
