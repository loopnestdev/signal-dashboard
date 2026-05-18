import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem('signal-theme') === 'dark'; }
    catch { return false; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('signal-theme', dark ? 'dark' : 'light'); }
    catch { /* storage unavailable */ }
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}
