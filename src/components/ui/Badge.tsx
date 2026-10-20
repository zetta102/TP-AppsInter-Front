import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

const tones = {
  neutral: 'bg-ink-800 text-ink-300',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-gold-500/15 text-gold-400',
  danger: 'bg-brand-500/15 text-brand-400',
  premium: 'bg-gold-500/15 text-gold-400',
} as const;

export type BadgeTone = keyof typeof tones;

/** Etiqueta de color para valores de enums y estados. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
