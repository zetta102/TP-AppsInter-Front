import type { ReactNode } from 'react';
import { cx } from '../../lib/cx.ts';

const tones = {
  neutral: 'border-ink-600 bg-ink-800 text-ink-300',
  success: 'border-hp-500 bg-hp-500/15 text-hp-400',
  warning: 'border-gold-600 bg-gold-500/15 text-gold-400',
  danger: 'border-virus-500 bg-virus-500/15 text-virus-400',
  premium: 'border-gold-600 bg-gold-500/15 text-gold-400',
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
        'inline-flex items-center border-2 px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
