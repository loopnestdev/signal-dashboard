import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type UserStatus = 'pending' | 'approved';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  status: UserStatus;
  is_admin: boolean;
  requested_at: string;
  approved_at: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    async function fetchProfile(userId: string) {
      if (!supabase) return;
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      setProfile(prof ?? null);
      if (prof?.is_admin) {
        const { data: pending } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('status', 'pending')
          .order('requested_at', { ascending: true });
        setPendingUsers(pending ?? []);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        void fetchProfile(u.id).then(() => setAuthLoading(false));
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        void fetchProfile(u.id);
      } else {
        setProfile(null);
        setPendingUsers([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () => {
    // VITE_SUPABASE_REDIRECT_URL must be set in Cloudflare Pages env vars to your
    // production domain AND added to Supabase → Authentication → URL Configuration →
    // Redirect URLs. Without this, Supabase falls back to its "Site URL" (localhost:3000).
    const redirectTo =
      (import.meta.env.VITE_SUPABASE_REDIRECT_URL as string | undefined) ||
      window.location.origin;
    void supabase?.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  };

  const signOut = () => {
    void supabase?.auth.signOut();
    setProfile(null);
    setPendingUsers([]);
  };

  const approveUser = async (userId: string) => {
    if (!supabase || !profile?.is_admin) return;
    const { error } = await supabase
      .from('user_profiles')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', userId);
    if (!error) {
      setPendingUsers(prev => prev.filter(p => p.id !== userId));
    }
  };

  return {
    user,
    authLoading,
    profile,
    isAdmin: profile?.is_admin ?? false,
    userStatus: profile?.status ?? null,
    pendingUsers,
    signInWithGoogle,
    signOut,
    approveUser,
  };
}
