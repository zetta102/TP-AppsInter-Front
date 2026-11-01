import { cx } from '../../lib/cx.ts';

export type PurchaseStep = 'seats' | 'order' | 'payment';

const steps: readonly { readonly key: PurchaseStep; readonly label: string }[] = [
  { key: 'seats', label: 'Asientos' },
  { key: 'order', label: 'Confitería' },
  { key: 'payment', label: 'Pago' },
];

/**
 * Pasos de la compra, iguales en el selector de asientos y en el checkout: cada pantalla muestra
 * todos los pasos y cuál es el actual (WCAG 3 "All steps listed" y "Current step indicated").
 *
 * El paso actual se marca con `aria-current="step"`, con la barra inferior y con el texto
 * "Paso N de 3", no solo con el color.
 */
export function PurchaseSteps({ current }: { readonly current: PurchaseStep }) {
  const index = steps.findIndex((step) => step.key === current);

  return (
    <div className="flex cine-plate flex-wrap items-center gap-x-4 gap-y-1">
      <ol aria-label="Pasos de la compra" className="flex items-center gap-3 font-display text-xs">
        {steps.map((step, position) => (
          <li
            key={step.key}
            aria-current={step.key === current ? 'step' : undefined}
            className={cx(
              'border-b-2 pb-1',
              step.key === current
                ? 'border-brand-400 text-brand-300'
                : 'border-transparent text-ink-500',
            )}
          >
            {position + 1} · {step.label}
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-300">
        Paso {index + 1} de {steps.length}
      </p>
    </div>
  );
}
