import { useId, useState } from 'react';
import type { AnimationEvent, CSSProperties, ReactNode } from 'react';
import {
  cardBrands,
  cardProgress,
  detectBrand,
  groupCardNumber,
  type CardBrand,
  type CardKind,
} from '../../lib/card.ts';
import { cx } from '../../lib/cx.ts';

/**
 * Tarjeta de 16 bits del paso de pago: empieza como una placa gris y se "transforma" en la
 * marca apenas los dígitos escritos alcanzan para reconocerla (`detectBrand`).
 *
 * Es arte de píxeles en SVG a su resolución nativa (86 × 54, la proporción ID-1) con
 * `crispEdges`, escalado por un entero (×3 o ×4) como `net-67-spin.svg`. Cada cambio de marca
 * vuelve a montar la cara frontal (`key`), lo que reinicia la secuencia de `global.css`:
 * destello, disolución por tramado Bayer de la marca anterior a la nueva, el logo que aparece
 * con destellos y un saltito. Además: línea de escaneo mientras no hay marca, un brillo al
 * completar un número válido, una sacudida si no pasa Luhn y un giro al enfocar el CVV.
 *
 * Es decorativa (`aria-hidden`): la marca detectada se anuncia como texto en `PaymentStep`. Solo
 * recibe el largo del CVV, nunca el código.
 */

type SkinKey = CardBrand | 'slate';

interface Skin {
  readonly base: string;
  readonly light: string;
  readonly dark: string;
  readonly chip: readonly [base: string, dark: string, light: string];
}

const goldChip = ['#e0b040', '#9a7320', '#f6dc8a'] as const;

const skins: Readonly<Record<SkinKey, Skin>> = {
  slate: {
    base: '#5b6170',
    light: '#737a8a',
    dark: '#434856',
    chip: ['#9aa0ab', '#6c727d', '#c3c8d0'],
  },
  visa: { base: '#1a2a8c', light: '#2b45b8', dark: '#0f1858', chip: goldChip },
  mastercard: { base: '#262626', light: '#3b3b3b', dark: '#141414', chip: goldChip },
  amex: { base: '#1f6fb8', light: '#3f8fd6', dark: '#134e86', chip: goldChip },
  discover: { base: '#5a2d0c', light: '#8a4614', dark: '#3a1c06', chip: goldChip },
  diners: { base: '#0b5f94', light: '#1f7fbd', dark: '#073f63', chip: goldChip },
  jcb: { base: '#116a3a', light: '#1e8c4f', dark: '#0a4a28', chip: goldChip },
};

const W = 86;
const H = 54;
const WHITE = '#f4f6ff';

/** Fuente de píxeles de 5 de alto para los logos (solo las letras que usan). */
const glyphs: Readonly<Record<string, readonly string[]>> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  V: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
};

const glyphWidth = (char: string) => glyphs[char]?.[0]?.length ?? 3;

function textWidth(text: string, scale = 1): number {
  return ([...text].reduce((sum, char) => sum + glyphWidth(char) + 1, 0) - 1) * scale;
}

/** Texto de la fuente de píxeles: un `<rect>` por tramo horizontal de cada fila. */
function PixelText({
  text,
  x,
  y,
  scale = 1,
  fill,
}: {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly fill: string;
}) {
  const rects: ReactNode[] = [];
  let cursor = x;
  for (const char of text) {
    (glyphs[char] ?? []).forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue;
        const start = c;
        while (row[c + 1] === '#') c++;
        rects.push(
          <rect
            key={`${cursor}-${r}-${start}`}
            x={cursor + start * scale}
            y={y + r * scale}
            width={(c - start + 1) * scale}
            height={scale}
          />,
        );
      }
    });
    cursor += (glyphWidth(char) + 1) * scale;
  }
  return <g fill={fill}>{rects}</g>;
}

interface Row {
  readonly y: number;
  readonly x0: number;
  readonly x1: number;
}

/** Filas de un disco de píxeles de diámetro `2r`, centrado en la esquina `(x, y)`. */
function discRows(x: number, y: number, r: number): Row[] {
  const rows: Row[] = [];
  for (let dy = -r; dy < r; dy++) {
    const half = Math.round(Math.sqrt(r * r - (dy + 0.5) ** 2));
    rows.push({ y: y + dy, x0: x - half, x1: x + half });
  }
  return rows;
}

function Rows({ rows, fill }: { readonly rows: readonly Row[]; readonly fill: string }) {
  return (
    <g fill={fill}>
      {rows
        .filter((row) => row.x1 > row.x0)
        .map((row) => (
          <rect key={row.y} x={row.x0} y={row.y} width={row.x1 - row.x0} height={1} />
        ))}
    </g>
  );
}

/**
 * Los `<rect>` de un rectángulo con las esquinas "redondeadas" de a píxeles (`r` escalones).
 * Sueltos, sin `<g>`: así también sirven dentro de un `<clipPath>`, que no admite grupos.
 */
function notchedRects(x: number, y: number, w: number, h: number, r = 1) {
  return Array.from({ length: r + 1 }, (_, i) => (
    <rect key={i} x={x + r - i} y={y + i} width={w - 2 * (r - i)} height={h - 2 * i} />
  ));
}

function Notched(props: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r?: number;
  readonly fill?: string;
  readonly style?: CSSProperties;
}) {
  const { x, y, w, h, r, fill, style } = props;
  return (
    <g fill={fill} style={style}>
      {notchedRects(x, y, w, h, r)}
    </g>
  );
}

function Logo({ skin }: { readonly skin: SkinKey }) {
  const { base } = skins[skin];
  switch (skin) {
    case 'slate':
      return <PixelText text="?" x={76} y={5} scale={2} fill="#ffffff59" />;
    case 'visa': {
      const width = textWidth('VISA', 2);
      return (
        <g>
          <PixelText text="VISA" x={81 - width} y={5} scale={2} fill={WHITE} />
          <rect x={81 - width} y={16} width={8} height={1} fill="#f7b600" />
        </g>
      );
    }
    case 'mastercard': {
      const red = discRows(66, 11, 5);
      const yellow = discRows(74, 11, 5);
      const overlap = red.map((row, i) => ({
        y: row.y,
        x0: Math.max(row.x0, yellow[i]?.x0 ?? row.x1),
        x1: Math.min(row.x1, yellow[i]?.x1 ?? row.x0),
      }));
      return (
        <g>
          <Rows rows={red} fill="#eb001b" />
          <Rows rows={yellow} fill="#f79e1b" />
          <Rows rows={overlap} fill="#ff5f00" />
        </g>
      );
    }
    case 'amex':
      return (
        <g>
          <Notched x={60} y={5} w={21} h={11} fill={WHITE} />
          <PixelText text="AMEX" x={62} y={8} fill={base} />
        </g>
      );
    case 'discover': {
      const x = 81 - (textWidth('DISC') + 1 + 6 + 1 + textWidth('VER'));
      const orbX = x + textWidth('DISC') + 1 + 3;
      return (
        <g>
          <PixelText text="DISC" x={x} y={8} fill={WHITE} />
          <Rows rows={discRows(orbX, 10, 3)} fill="#ff7a00" />
          <rect x={orbX - 2} y={8} width={1} height={1} fill="#ffc27a" />
          <PixelText text="VER" x={orbX + 4} y={8} fill={WHITE} />
        </g>
      );
    }
    case 'diners':
      return (
        <g>
          <PixelText text="DINERS" x={66 - textWidth('DINERS')} y={9} fill={WHITE} />
          <Rows rows={discRows(75, 11, 6)} fill={WHITE} />
          <Rows rows={discRows(75, 11, 4)} fill={base} />
          <rect x={74} y={7} width={2} height={8} fill={WHITE} />
        </g>
      );
    case 'jcb':
      return (
        <g>
          {(['#0e4c96', '#e21836', '#00965f'] as const).map((fill, i) => (
            <g key={fill}>
              <Notched x={59 + i * 8} y={5} w={7} h={11} fill={fill} />
              <PixelText text={'JCB'[i] ?? ''} x={61 + i * 8} y={8} fill={WHITE} />
            </g>
          ))}
        </g>
      );
  }
}

/** Placa, bandas tramadas, chip y símbolo sin contacto: lo que se disuelve entre marcas. */
function SkinBody({ skin, uid }: { readonly skin: SkinKey; readonly uid: string }) {
  const { base, light, dark, chip } = skins[skin];
  const [chipBase, chipDark, chipLight] = chip;
  return (
    <g>
      <g clipPath={`url(#${uid}-body)`}>
        <rect width={W} height={H} fill={base} />
        <rect y={0} width={W} height={10} fill={light} />
        <rect y={10} width={W} height={4} fill={light} mask={`url(#${uid}-checker)`} />
        <rect y={40} width={W} height={4} fill={dark} mask={`url(#${uid}-checker)`} />
        <rect y={44} width={W} height={10} fill={dark} />
      </g>
      <Notched x={8} y={17} w={11} h={8} fill={chipBase} />
      <g fill={chipDark}>
        <rect x={8} y={19} width={11} height={1} />
        <rect x={8} y={22} width={11} height={1} />
        <rect x={12} y={17} width={1} height={8} />
        <rect x={15} y={17} width={1} height={8} />
      </g>
      <rect x={9} y={18} width={2} height={1} fill={chipLight} />
      <g fill="#ffffff80">
        <rect x={22} y={19} width={1} height={3} />
        <rect x={24} y={18} width={1} height={1} />
        <rect x={25} y={19} width={1} height={3} />
        <rect x={24} y={22} width={1} height={1} />
        <rect x={27} y={17} width={1} height={1} />
        <rect x={28} y={18} width={1} height={5} />
        <rect x={27} y={23} width={1} height={1} />
      </g>
    </g>
  );
}

/** Texto en Press Start 2P con sombra dura de 2 px; `rest` va atenuado (la plantilla vacía). */
function CardText({
  x,
  y,
  size,
  value,
  rest = '',
  className,
}: {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly value: string;
  readonly rest?: string;
  readonly className?: string;
}) {
  const content = (fill: string, dim: string) => (
    <>
      <tspan fill={fill}>{value}</tspan>
      {rest && <tspan fill={dim}>{rest}</tspan>}
    </>
  );
  return (
    <g className={className} fontSize={size} style={{ whiteSpace: 'pre' }}>
      <text x={x + 0.5} y={y + 0.5} className="font-mono" fill="#00000073">
        {content('#00000073', '#00000033')}
      </text>
      <text x={x} y={y} className="font-mono">
        {content(WHITE, '#ffffff66')}
      </text>
    </g>
  );
}

/** Orden de un tramado Bayer de 4 × 4: el cuadro `k` enciende los píxeles `2k` y `2k + 1`. */
const bayer = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;
const DISSOLVE_FRAMES = 8;

// Sin tildes, como en una tarjeta grabada: Press Start 2P tampoco las tiene.
const kindLabels: Readonly<Record<CardKind, string>> = { credit: 'CREDITO', debit: 'DEBITO' };

const sparkles = [
  [52, 4],
  [83, 19],
  [44, 14],
  [70, 2],
] as const;

export interface PixelCardProps {
  readonly digits: string;
  readonly name: string;
  readonly expiry: string;
  readonly cvvLength: number;
  readonly kind: CardKind | null;
  readonly cvvFocused: boolean;
}

export function PixelCard({ digits, name, expiry, cvvLength, kind, cvvFocused }: PixelCardProps) {
  const uid = `pc${useId().replace(/[^\w-]/g, '')}`;
  const brand = detectBrand(digits);
  const progress = cardProgress(digits);
  const skin: SkinKey = brand ?? 'slate';

  // Cada cambio de marca guarda la anterior para disolverla debajo de la nueva; `nonce` vuelve a
  // montar la cara frontal y así reinicia la animación. Se ajusta durante el render, sin efectos.
  const [view, setView] = useState({ skin, prev: null as SkinKey | null, nonce: 0 });
  if (view.skin !== skin) setView({ skin, prev: view.skin, nonce: view.nonce + 1 });

  // Amex lleva el código en el frente: no se da vuelta.
  const flipped = cvvFocused && brand !== 'amex';
  // Hasta el primer giro no hay animación de giro: si no, correría al montar.
  const [flipReady, setFlipReady] = useState(false);
  if (flipped && !flipReady) setFlipReady(true);

  const onAnimationEnd = (event: AnimationEvent<SVGSVGElement>) => {
    if (event.animationName === 'pc-hop') setView((current) => ({ ...current, prev: null }));
  };

  // Número: lo escrito, seguido de la plantilla atenuada agrupada como en la tarjeta final.
  const templateLength = Math.max(digits.length, brand ? cardBrands[brand].typicalLength : 16);
  const template = groupCardNumber(digits.padEnd(templateLength, '*'), brand);
  let split = 0;
  for (let seen = 0; seen < digits.length; split++) if (template[split] !== ' ') seen++;

  const holder = name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
  const cvvMask = '*'.repeat(cvvLength);
  const cvvTemplate = '*'.repeat(brand ? cardBrands[brand].cvvLength : 3);

  const outline =
    progress === 'invalid'
      ? 'var(--color-virus-500)'
      : progress === 'complete'
        ? 'var(--color-hp-500)'
        : '#0a0e1c';

  return (
    <div
      aria-hidden="true"
      className={cx(
        'w-[258px] drop-shadow-[4px_4px_0_rgb(0_0_0/0.45)] select-none sm:w-[344px]',
        progress === 'invalid' && 'pc-shake',
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        shapeRendering="crispEdges"
        className={cx('block h-auto w-full', flipReady && 'pc-flip-ready', flipped && 'pc-flipped')}
        onAnimationEnd={onAnimationEnd}
      >
        <defs>
          <clipPath id={`${uid}-body`}>{notchedRects(1, 1, W - 2, H - 2, 2)}</clipPath>
          <pattern id={`${uid}-checker-p`} width={2} height={2} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#fff" />
            <rect x={1} y={1} width={1} height={1} fill="#fff" />
          </pattern>
          <mask id={`${uid}-checker`}>
            <rect width={W} height={H} fill={`url(#${uid}-checker-p)`} />
          </mask>
          {Array.from({ length: DISSOLVE_FRAMES }, (_, frame) => (
            <pattern
              key={frame}
              id={`${uid}-bayer-${frame}`}
              width={4}
              height={4}
              patternUnits="userSpaceOnUse"
            >
              {bayer.flatMap((row, y) =>
                row.map((value, x) =>
                  Math.floor(value / 2) === frame ? (
                    <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#fff" />
                  ) : null,
                ),
              )}
            </pattern>
          ))}
        </defs>

        <g className="pc-face-front">
          <g key={view.nonce} className={cx(view.nonce > 0 && 'pc-animate')}>
            <g className="pc-hop">
              <Notched x={0} y={0} w={W} h={H} r={2} style={{ fill: outline }} />
              {view.prev !== null && (
                <>
                  {/* Cada capa del tramado se enciende un cuadro después de la anterior. */}
                  <mask id={`${uid}-dissolve`}>
                    {Array.from({ length: DISSOLVE_FRAMES }, (_, frame) => (
                      <rect
                        key={frame}
                        className="pc-dissolve-layer"
                        width={W}
                        height={H}
                        fill={`url(#${uid}-bayer-${frame})`}
                        style={{ '--pc-frame': frame } as CSSProperties}
                      />
                    ))}
                  </mask>
                  <SkinBody skin={view.prev} uid={uid} />
                  <Logo skin={view.prev} />
                </>
              )}
              <g mask={view.prev === null ? undefined : `url(#${uid}-dissolve)`}>
                <SkinBody skin={view.skin} uid={uid} />
              </g>
              <g className="pc-logo">
                <Logo skin={view.skin} />
              </g>

              {kind && <CardText x={6} y={9} size={2.5} value={kindLabels[kind]} />}
              <CardText
                x={6}
                y={37}
                size={Math.min(4, 74 / template.length)}
                value={template.slice(0, split)}
                rest={template.slice(split)}
              />
              {brand === 'amex' && (
                <CardText
                  x={68}
                  y={29}
                  size={2.5}
                  value={cvvMask}
                  rest={cvvTemplate.slice(cvvLength)}
                  {...(cvvFocused ? { className: 'pc-blink' } : {})}
                />
              )}
              <CardText x={6} y={43} size={2} value="" rest="TITULAR" />
              <CardText
                x={6}
                y={49}
                size={Math.min(3, 54 / Math.max(holder.length, 1))}
                value={holder}
                rest={holder ? '' : 'NOMBRE APELLIDO'}
              />
              <CardText x={66} y={43} size={2} value="" rest="VENCE" />
              <CardText x={66} y={49} size={3} value={expiry} rest={'MM/AA'.slice(expiry.length)} />

              <rect
                className="pc-flash"
                width={W}
                height={H}
                fill="#fff"
                clipPath={`url(#${uid}-body)`}
              />
              {view.nonce > 0 &&
                view.skin !== 'slate' &&
                sparkles.map(([x, y], i) => (
                  <g key={i} className="pc-sparkle" style={{ '--pc-i': i } as CSSProperties}>
                    <rect x={x - 1} y={y} width={3} height={1} fill={WHITE} />
                    <rect x={x} y={y - 1} width={1} height={3} fill={WHITE} />
                    <rect x={x} y={y} width={1} height={1} fill="#f7d44a" />
                  </g>
                ))}
            </g>
          </g>

          <g clipPath={`url(#${uid}-body)`}>
            {progress === 'scanning' && (
              <rect className="pc-scanline" width={W} height={2} fill="#fff" />
            )}
            {progress === 'complete' && (
              <polygon className="pc-glint" points="0,54 6,54 24,0 18,0" fill="#fff" />
            )}
          </g>
        </g>

        <g className="pc-face-back">
          <Notched x={0} y={0} w={W} h={H} r={2} style={{ fill: outline }} />
          <g clipPath={`url(#${uid}-body)`}>
            <rect width={W} height={H} fill={skins[skin].base} />
            <rect y={44} width={W} height={10} fill={skins[skin].dark} />
            <rect y={6} width={W} height={8} fill="#0b0b10" />
          </g>
          <rect x={6} y={20} width={56} height={8} fill="#e9e6d8" />
          <rect x={6} y={20} width={56} height={8} fill="#c9c3aa" mask={`url(#${uid}-checker)`} />
          <rect x={64} y={20} width={16} height={8} fill="#ffffff" />
          <CardText x={64} y={18} size={2} value="" rest="CVV" />
          <text x={66} y={26} fontSize={3} className="font-mono" fill="#1a1a2a">
            {cvvMask}
            <tspan fill="#1a1a2a55">{cvvTemplate.slice(cvvLength)}</tspan>
          </text>
          <Notched x={70} y={37} w={10} h={7} fill="#c9a640" />
          <rect x={70} y={37} width={10} height={7} fill="#f6e7a8" mask={`url(#${uid}-checker)`} />
        </g>
      </svg>
    </div>
  );
}
