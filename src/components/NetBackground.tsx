import { cx } from '../lib/cx.ts';
import { isNetMode, type NetMode, setNetMode, useNetMode } from '../lib/use-net-mode.ts';
import './NetBackground.css';

/**
 * Fondo "Net": dos capas de baldosas de 16 bits al estilo de las áreas de Internet de Mega Man
 * Battle Network. Lejos, una grilla de circuito; cerca, los pares "6 7", que en modo animado se
 * desplazan en diagonal y giran sobre su eje vertical como los emblemas de MMBN 4-6.
 *
 * El giro vive dentro de `net-67-spin.svg`, con cuadros de píxeles dibujados a mano y sin escalados
 * que emborronen. La página no puede pausar la animación de una imagen: fuera del modo animado se
 * usa la baldosa estática `net-67.svg`.
 *
 * Vive en el layout raíz, así que navegar entre páginas no lo vuelve a montar ni reinicia la
 * animación. Los modos están en `use-net-mode.ts`; con colores forzados (alto contraste) el fondo
 * no se dibuja.
 */
export function NetBackground() {
  const mode = useNetMode();
  return (
    <div className="net-bg" aria-hidden="true" data-mode={mode}>
      <div className="net-layer net-layer-far" />
      <div className="net-layer net-layer-near" />
    </div>
  );
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

/**
 * El grupo "Fondo" del pie. Fondo quieto por defecto (WCAG 3 "No visual motion"); con movimiento
 * reducido, "Animado" no se ofrece.
 */
export function NetModeControl() {
  const mode = useNetMode();
  // Con movimiento reducido la opción "Animado" está oculta y el fondo no se mueve: se marca
  // "Quieto", que es lo que se ve.
  const reduced = window.matchMedia(reducedMotionQuery).matches;
  const shown = reduced && mode === 'animado' ? 'quieto' : mode;

  const option = (value: NetMode, label: string, className?: string) => (
    <label className={cx('flex items-center gap-1.5', className)}>
      <input
        type="radio"
        name="net-mode"
        value={value}
        checked={shown === value}
        onChange={(event) => {
          if (isNetMode(event.target.value)) setNetMode(event.target.value);
        }}
        className="size-4 accent-brand-500"
      />
      {label}
    </label>
  );

  return (
    <fieldset className="flex flex-col items-center gap-1 forced-colors:hidden">
      <legend className="mb-1 text-ink-300">Fondo</legend>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {option('animado', 'Animado', 'motion-reduce:hidden')}
        {option('quieto', 'Quieto')}
        {option('liso', 'Liso')}
      </div>
    </fieldset>
  );
}
