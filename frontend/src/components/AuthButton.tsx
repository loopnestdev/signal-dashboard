import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { C } from '../lib/colors';

interface Props {
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function AuthButton({ user, authLoading, onSignIn, onSignOut }: Props) {
  // Render nothing when Supabase is not configured or session is still resolving
  if (!supabase || authLoading) return null;

  const pill: React.CSSProperties = {
    fontFamily: 'inherit', cursor: 'pointer',
    borderRadius: 9999, border: `1px solid ${C.border}`,
    transition: 'background 0.15s, color 0.15s',
  };

  if (!user) {
    return (
      <button
        onClick={onSignIn}
        style={{ ...pill, background: C.canvas, color: C.inkMute, fontSize: '13px', padding: '6px 14px', boxShadow: C.s1 }}
      >
        Sign in
      </button>
    );
  }

  const displayName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Account';
  const avatar = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {avatar && (
        <img
          src={avatar}
          alt=""
          referrerPolicy="no-referrer"
          style={{ width: 24, height: 24, borderRadius: '50%', border: `1px solid ${C.border}`, flexShrink: 0 }}
        />
      )}
      <span style={{
        fontSize: '12px', color: C.inkMute,
        maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {displayName}
      </span>
      <button
        onClick={onSignOut}
        style={{ ...pill, background: 'transparent', color: C.inkMute, fontSize: '12px', padding: '4px 12px' }}
      >
        Sign out
      </button>
    </div>
  );
}
