// Design tokens — all values are CSS custom properties defined in index.css.
// Light/dark mode is toggled by setting data-theme="dark" on <html>.
export const C = {
  // Text
  ink:       'var(--c-ink)',
  inkSec:    'var(--c-ink-sec)',
  inkMute:   'var(--c-ink-mute)',
  onPrimary: 'var(--c-on-primary)',

  // Surfaces
  canvas:      'var(--c-canvas)',
  canvasSoft:  'var(--c-canvas-soft)',
  canvasCream: 'var(--c-canvas-cream)',

  // Borders
  border:      'var(--c-border)',
  borderInput: 'var(--c-border-input)',

  // Brand
  primary:       'var(--c-primary)',
  primaryDeep:   'var(--c-primary-deep)',
  primaryBg:     'var(--c-primary-bg)',
  primaryBorder: 'var(--c-primary-border)',

  // Semantic
  bull:       'var(--c-bull)',
  bullBg:     'var(--c-bull-bg)',
  bullBorder: 'var(--c-bull-border)',
  bear:       'var(--c-bear)',
  bearBg:     'var(--c-bear-bg)',
  bearBorder: 'var(--c-bear-border)',
  warn:       'var(--c-warn)',
  warnBg:     'var(--c-warn-bg)',
  warnBorder: 'var(--c-warn-border)',

  // Shadows
  s1: 'var(--c-s1)',
  s2: 'var(--c-s2)',
} as const;

export function scoreColor(score: number): string {
  if (score >= 65) return C.bull;
  if (score >= 45) return C.warn;
  return C.bear;
}

export function changeColor(pct: number): string {
  if (pct > 0.3) return C.bull;
  if (pct < -0.3) return C.bear;
  return C.inkMute;
}
