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
 * Tarjeta de 32 bits del paso de pago: empieza como una placa gris y se "transforma" en la
 * marca apenas los dígitos escritos alcanzan para reconocerla (`detectBrand`).
 *
 * Es arte de píxeles en SVG a su resolución nativa (172 × 108, la proporción ID-1) con
 * `crispEdges`, mostrada a ×2 (×1,5 en pantallas angostas). Como en la era de 32 bits, cada marca
 * tiene rampas de 5 tonos con degradés tramados (Bayer 4 × 4), biseles, brillo y líneas de
 * seguridad; el número va en relieve. Cada cambio de marca vuelve a montar la cara frontal
 * (`key`), lo que reinicia la secuencia de `global.css`: destello, disolución por tramado de la
 * marca anterior a la nueva, el logo que aparece con destellos y un saltito. Además: línea de
 * escaneo mientras no hay marca, un brillo al completar un número válido, una sacudida si no
 * pasa Luhn y un giro pseudo-3D al enfocar el CVV, con un holograma de colores cíclicos al dorso.
 *
 * Es decorativa (`aria-hidden`): la marca detectada se anuncia como texto en `PaymentStep`. Solo
 * recibe el largo del CVV, nunca el código.
 */

type SkinKey = CardBrand | 'slate';

/** De oscuro a claro: sombra, oscuro, base, claro, luz. */
type Ramp = readonly [shadow: string, dark: string, base: string, light: string, highlight: string];

interface Skin {
  readonly ramp: Ramp;
  /** Sombra, oscuro, base y luz del chip. */
  readonly chip: readonly [string, string, string, string];
}

const goldChip = ['#6e4f10', '#9a7320', '#e0b040', '#f6dc8a'] as const;

const skins: Readonly<Record<SkinKey, Skin>> = {
  slate: {
    ramp: ['#2e323c', '#434856', '#5b6170', '#767d8e', '#9aa1b2'],
    chip: ['#4f545e', '#6c727d', '#9aa0ab', '#c9ced6'],
  },
  visa: { ramp: ['#0a0f3d', '#13206a', '#1a2a8c', '#2b45b8', '#4d6be0'], chip: goldChip },
  mastercard: { ramp: ['#0b0b0b', '#171717', '#262626', '#3a3a3a', '#555555'], chip: goldChip },
  amex: { ramp: ['#0b3560', '#134e86', '#1f6fb8', '#3f8fd6', '#74b3ec'], chip: goldChip },
  discover: { ramp: ['#2a1203', '#3a1c06', '#5a2d0c', '#8a4614', '#b9682a'], chip: goldChip },
  diners: { ramp: ['#04304f', '#073f63', '#0b5f94', '#1f7fbd', '#4fa3d8'], chip: goldChip },
  jcb: { ramp: ['#063019', '#0a4a28', '#116a3a', '#1e8c4f', '#3fb06e'], chip: goldChip },
};

const W = 172;
const H = 108;
const CORNER = 3;
const WHITE = '#f4f6ff';

/** Fuente de píxeles de 3 × 5 (M, N, V y W más anchas) para logos y rótulos chicos. */
const glyphs: Readonly<Record<string, readonly string[]>> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

const GLYPH_ROWS = 5;
const glyphWidth = (char: string) => glyphs[char]?.[0]?.length ?? 3;

function textWidth(text: string, scale = 1, italic = 0): number {
  return (
    ([...text].reduce((sum, char) => sum + glyphWidth(char) + 1, 0) - 1) * scale +
    (GLYPH_ROWS - 1) * italic
  );
}

interface PixelTextProps {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  /** Corrimiento por fila hacia la derecha (cursiva escalonada). */
  readonly italic?: number;
  readonly fill: string;
  /** Sombra dura de 1 píxel abajo a la derecha. */
  readonly shadow?: string;
}

/** Texto de la fuente de píxeles: un `<rect>` por tramo horizontal de cada fila. */
function PixelText({ text, x, y, scale = 1, italic = 0, fill, shadow }: PixelTextProps) {
  const rects = (dx: number, dy: number) => {
    const out: ReactNode[] = [];
    let cursor = x + dx;
    for (const char of text) {
      (glyphs[char] ?? []).forEach((row, r) => {
        const shift = (GLYPH_ROWS - 1 - r) * italic;
        for (let c = 0; c < row.length; c++) {
          if (row[c] !== '#') continue;
          const start = c;
          while (row[c + 1] === '#') c++;
          out.push(
            <rect
              key={`${cursor}-${r}-${start}`}
              x={cursor + shift + start * scale}
              y={y + dy + r * scale}
              width={(c - start + 1) * scale}
              height={scale}
            />,
          );
        }
      });
      cursor += (glyphWidth(char) + 1) * scale;
    }
    return out;
  };
  return (
    <g>
      {shadow && <g fill={shadow}>{rects(1, 1)}</g>}
      <g fill={fill}>{rects(0, 0)}</g>
    </g>
  );
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

/** Una línea ondulada de 1 píxel de alto ("guilloche" de seguridad), en tramos horizontales. */
function waveRows(cy: number, amplitude: number, period: number, phase: number): Row[] {
  const yAt = (x: number) => cy + Math.round(amplitude * Math.sin(x / period + phase));
  const rows: Row[] = [];
  let start = 0;
  for (let x = 1; x <= W; x++) {
    if (x === W || yAt(x) !== yAt(start)) {
      rows.push({ y: yAt(start), x0: start, x1: x });
      start = x;
    }
  }
  return rows;
}

function Rows({ rows, fill }: { readonly rows: readonly Row[]; readonly fill: string }) {
  return (
    <g fill={fill}>
      {rows
        .filter((row) => row.x1 > row.x0)
        .map((row) => (
          <rect
            key={`${row.y}-${row.x0}`}
            x={row.x0}
            y={row.y}
            width={row.x1 - row.x0}
            height={1}
          />
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

/** Orden de un tramado Bayer de 4 × 4: umbrales de 0 a 15. */
const bayer = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;
/** La disolución enciende un umbral por cuadro. */
const DISSOLVE_FRAMES = 16;
/** Niveles de cobertura (de 16) de las máscaras de degradé. */
const LEVELS = [4, 8, 12] as const;

/**
 * Banda de degradé tramado: `fill` cubre de más a menos (`fade: 'down'`) o de menos a más
 * (`'up'`), de a `step` filas por nivel.
 */
function DitherBand({
  uid,
  y,
  step,
  fill,
  fade,
}: {
  readonly uid: string;
  readonly y: number;
  readonly step: number;
  readonly fill: string;
  readonly fade: 'down' | 'up';
}) {
  const levels = fade === 'down' ? LEVELS.toReversed() : LEVELS;
  return (
    <g fill={fill}>
      {levels.map((level, i) => (
        <rect
          key={level}
          y={y + i * step}
          width={W}
          height={step}
          mask={`url(#${uid}-lv${level})`}
        />
      ))}
    </g>
  );
}

/** Placa con degradé, bisel, brillo diagonal y líneas de seguridad: lo que se disuelve. */
function SkinPlate({ skin, uid }: { readonly skin: SkinKey; readonly uid: string }) {
  const [shadow, dark, base, light, highlight] = skins[skin].ramp;
  return (
    <g clipPath={`url(#${uid}-body)`}>
      <rect width={W} height={H} fill={base} />
      {/* Arriba: brillo y tono claro que se funden en la base. */}
      <rect width={W} height={16} fill={light} />
      <DitherBand uid={uid} y={16} step={4} fill={light} fade="down" />
      <rect width={W} height={2} fill={highlight} />
      <DitherBand uid={uid} y={2} step={2} fill={highlight} fade="down" />
      {/* Abajo: la base se oscurece hasta la sombra del borde. */}
      <DitherBand uid={uid} y={78} step={4} fill={dark} fade="up" />
      <rect y={90} width={W} height={18} fill={dark} />
      <DitherBand uid={uid} y={98} step={2} fill={shadow} fade="up" />
      <rect y={104} width={W} height={4} fill={shadow} />

      <g opacity={0.2}>
        <Rows rows={waveRows(50, 3, 9, 0)} fill={highlight} />
        <Rows rows={waveRows(56, 3, 9, 2)} fill={highlight} />
        <Rows rows={waveRows(62, 2, 7, 4)} fill={highlight} />
      </g>
      <polygon points="52,0 76,0 40,108 16,108" fill={highlight} opacity={0.08} />
      <polygon points="84,0 90,0 54,108 48,108" fill={highlight} opacity={0.06} />

      {/* Bisel de 1 píxel: luz arriba a la izquierda, sombra abajo a la derecha. */}
      <rect y={1} width={W} height={1} fill={highlight} opacity={0.6} />
      <rect x={1} width={1} height={H} fill={highlight} opacity={0.4} />
      <rect y={H - 2} width={W} height={1} fill={shadow} />
      <rect x={W - 2} width={1} height={H} fill={shadow} />
    </g>
  );
}

/** Chip de contactos con bisel y un brillo por contacto, y el símbolo sin contacto. */
function Chip({ skin }: { readonly skin: SkinKey }) {
  const [shadow, dark, base, light] = skins[skin].chip;
  const x = 16;
  const y = 34;
  return (
    <g>
      <Notched x={x} y={y} w={24} h={18} r={2} fill={shadow} />
      <Notched x={x} y={y} w={23} h={17} r={2} fill={light} />
      <Notched x={x + 1} y={y + 1} w={22} h={16} r={2} fill={base} />
      <g fill={dark}>
        <rect x={x + 1} y={y + 6} width={22} height={1} />
        <rect x={x + 1} y={y + 11} width={22} height={1} />
        <rect x={x + 8} y={y + 1} width={1} height={16} />
        <rect x={x + 15} y={y + 1} width={1} height={16} />
        <rect x={x + 10} y={y + 7} width={4} height={4} />
      </g>
      <g fill={light}>
        {[x + 2, x + 9, x + 16].flatMap((px) =>
          [y + 2, y + 7, y + 12].map((py) => (
            <rect key={`${px}-${py}`} x={px} y={py} width={2} height={1} />
          )),
        )}
      </g>
      <g fill="#ffffff8c">
        {[0, 1, 2, 3].map((i) => {
          const ax = 46 + i * 3;
          const half = 2 + i * 2;
          return (
            <g key={i}>
              <rect x={ax} y={43 - half} width={1} height={1} />
              <rect x={ax + 1} y={43 - half + 1} width={1} height={half * 2 - 1} />
              <rect x={ax} y={43 + half} width={1} height={1} />
            </g>
          );
        })}
      </g>
    </g>
  );
}

function Logo({ skin, uid }: { readonly skin: SkinKey; readonly uid: string }) {
  const [shadow, dark, , light] = skins[skin].ramp;
  switch (skin) {
    case 'slate':
      return <PixelText text="?" x={152} y={9} scale={3} fill="#ffffffb3" shadow={shadow} />;
    case 'visa': {
      const x = 164 - textWidth('VISA', 3, 1);
      return (
        <g>
          <PixelText text="VISA" x={x} y={9} scale={3} italic={1} fill={WHITE} shadow={shadow} />
          <rect x={x} y={27} width={22} height={2} fill="#f7b600" />
          <rect x={x} y={29} width={22} height={1} fill="#b98500" />
        </g>
      );
    }
    case 'mastercard': {
      const red = discRows(126, 21, 10);
      const yellow = discRows(142, 21, 10);
      const overlap = red.map((row, i) => ({
        y: row.y,
        x0: Math.max(row.x0, yellow[i]?.x0 ?? row.x1),
        x1: Math.min(row.x1, yellow[i]?.x1 ?? row.x0),
      }));
      return (
        <g>
          <Rows rows={discRows(126, 21, 11)} fill="#a80014" />
          <Rows rows={red} fill="#eb001b" />
          <Rows rows={discRows(142, 21, 11)} fill="#c27400" />
          <Rows rows={yellow} fill="#f79e1b" />
          <Rows rows={overlap} fill="#ff5f00" />
          <g fill="#ff6b7a">
            <rect x={119} y={13} width={4} height={1} />
            <rect x={117} y={14} width={2} height={1} />
            <rect x={116} y={15} width={1} height={2} />
          </g>
          <g fill="#ffd07a">
            <rect x={145} y={13} width={4} height={1} />
            <rect x={149} y={14} width={2} height={1} />
            <rect x={151} y={15} width={1} height={2} />
          </g>
          <PixelText text="MASTERCARD" x={114} y={35} fill="#ffffffd9" />
        </g>
      );
    }
    case 'amex':
      return (
        <g>
          <Notched x={108} y={8} w={56} h={26} r={2} fill={WHITE} />
          <Notched x={110} y={10} w={52} h={22} r={1} fill={dark} />
          <rect x={110} y={10} width={52} height={1} fill={light} />
          <PixelText text="AMERICAN" x={119} y={13} fill={WHITE} shadow={shadow} />
          <PixelText text="EXPRESS" x={122} y={22} fill={WHITE} shadow={shadow} />
        </g>
      );
    case 'discover': {
      const x = 164 - (textWidth('DISC', 2) + 2 + 12 + 2 + textWidth('VER', 2));
      const orbX = x + textWidth('DISC', 2) + 2 + 6;
      return (
        <g>
          <PixelText text="DISC" x={x} y={12} scale={2} fill={WHITE} shadow={shadow} />
          <Rows rows={discRows(orbX, 17, 6)} fill="#b33f00" />
          <Rows rows={discRows(orbX, 17, 5)} fill="#ff6a00" />
          <Rows rows={discRows(orbX - 1, 16, 3)} fill="#ff8f2e" />
          <rect x={orbX - 4} y={13} width={2} height={1} fill="#ffd2a1" />
          <rect x={orbX - 5} y={14} width={1} height={1} fill="#ffd2a1" />
          <PixelText text="VER" x={orbX + 8} y={12} scale={2} fill={WHITE} shadow={shadow} />
        </g>
      );
    }
    case 'diners':
      return (
        <g>
          <PixelText text="DINERS" x={112} y={15} fill={WHITE} shadow={shadow} />
          <PixelText text="CLUB" x={121} y={23} fill={WHITE} shadow={shadow} />
          <Rows rows={discRows(152, 22, 12)} fill="#b8c7d6" />
          <Rows rows={discRows(152, 22, 11)} fill={WHITE} />
          <Rows rows={discRows(152, 22, 8)} fill={dark} />
          <rect x={146} y={17} width={1} height={10} fill={light} />
          <rect x={151} y={14} width={2} height={16} fill={WHITE} />
        </g>
      );
    case 'jcb':
      return (
        <g>
          {(
            [
              ['J', '#2a6cc0', '#0e4c96'],
              ['C', '#ff3b55', '#c4122c'],
              ['B', '#22b57e', '#00804f'],
            ] as const
          ).map(([letter, top, bottom], i) => {
            const x = 120 + i * 15;
            return (
              <g key={letter}>
                <Notched x={x} y={8} w={14} h={26} r={2} fill={bottom} />
                <g fill={top}>
                  <rect x={x + 2} y={8} width={10} height={1} />
                  <rect x={x + 1} y={9} width={12} height={1} />
                  <rect x={x} y={10} width={14} height={10} />
                  <rect x={x} y={20} width={14} height={3} mask={`url(#${uid}-lv8)`} />
                </g>
                <PixelText
                  text={letter}
                  x={x + 4}
                  y={16}
                  scale={2}
                  fill={WHITE}
                  shadow="#00000066"
                />
              </g>
            );
          })}
        </g>
      );
  }
}

/** Texto en Press Start 2P "en relieve": luz arriba a la izquierda, sombra abajo a la derecha. */
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
  const layer = (dx: number, dy: number, fill: string, dim: string) => (
    <text x={x + dx} y={y + dy} className="font-mono">
      <tspan fill={fill}>{value}</tspan>
      {rest && <tspan fill={dim}>{rest}</tspan>}
    </text>
  );
  return (
    <g className={className} fontSize={size} style={{ whiteSpace: 'pre' }}>
      {layer(1, 1, '#00000080', '#00000033')}
      {layer(-0.5, -0.5, '#ffffff66', '#ffffff1a')}
      {layer(0, 0, '#e3e8f4', '#ffffff59')}
    </g>
  );
}

// Sin tildes, como en una tarjeta grabada: ni Press Start 2P ni la fuente de píxeles las tienen.
const kindLabels: Readonly<Record<CardKind, string>> = { credit: 'CREDITO', debit: 'DEBITO' };

const sparkles = [
  [104, 8],
  [166, 38],
  [88, 28],
  [140, 4],
] as const;

const rainbow = ['#ff5f6d', '#ffb347', '#fff275', '#7dff9b', '#6ad8ff', '#b48cff'] as const;

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
  const [backShadow, backDark] = skins[skin].ramp;

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
          <clipPath id={`${uid}-body`}>{notchedRects(1, 1, W - 2, H - 2, CORNER)}</clipPath>
          <clipPath id={`${uid}-holo`}>{notchedRects(136, 72, 24, 16, 2)}</clipPath>
          {/* Un patrón por umbral (disolución) y uno acumulado por nivel (degradés). */}
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
                  value === frame ? (
                    <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#fff" />
                  ) : null,
                ),
              )}
            </pattern>
          ))}
          {LEVELS.map((level) => (
            <g key={level}>
              <pattern
                id={`${uid}-lv${level}-p`}
                width={4}
                height={4}
                patternUnits="userSpaceOnUse"
              >
                {bayer.flatMap((row, y) =>
                  row.map((value, x) =>
                    value < level ? (
                      <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#fff" />
                    ) : null,
                  ),
                )}
              </pattern>
              <mask id={`${uid}-lv${level}`}>
                <rect width={W} height={H} fill={`url(#${uid}-lv${level}-p)`} />
              </mask>
            </g>
          ))}
          <pattern id={`${uid}-diag`} width={4} height={4} patternUnits="userSpaceOnUse">
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={3 - i} y={i} width={1} height={1} fill="#cfc8ad" />
            ))}
          </pattern>
        </defs>

        <g className="pc-face-front">
          <g key={view.nonce} className={cx(view.nonce > 0 && 'pc-animate')}>
            <g className="pc-hop">
              <Notched x={0} y={0} w={W} h={H} r={CORNER} style={{ fill: outline }} />
              {view.prev !== null && (
                <>
                  {/* Cada umbral del tramado se enciende un cuadro después del anterior. */}
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
                  <SkinPlate skin={view.prev} uid={uid} />
                  <Chip skin={view.prev} />
                  <Logo skin={view.prev} uid={uid} />
                </>
              )}
              <g mask={view.prev === null ? undefined : `url(#${uid}-dissolve)`}>
                <SkinPlate skin={view.skin} uid={uid} />
                <Chip skin={view.skin} />
              </g>
              <g className="pc-logo">
                <Logo skin={view.skin} uid={uid} />
              </g>

              {kind && (
                <PixelText
                  text={kindLabels[kind]}
                  x={12}
                  y={12}
                  fill="#ffffffbf"
                  shadow="#00000066"
                />
              )}
              <CardText
                x={12}
                y={76}
                size={Math.min(8, 150 / template.length)}
                value={template.slice(0, split)}
                rest={template.slice(split)}
              />
              {brand === 'amex' && (
                <CardText
                  x={140}
                  y={60}
                  size={5}
                  value={cvvMask}
                  rest={cvvTemplate.slice(cvvLength)}
                  {...(cvvFocused ? { className: 'pc-blink' } : {})}
                />
              )}
              <PixelText text="TITULAR" x={12} y={83} fill="#ffffff80" />
              <CardText
                x={12}
                y={98}
                size={Math.min(6, 112 / Math.max(holder.length, 1))}
                value={holder}
                rest={holder ? '' : 'NOMBRE APELLIDO'}
              />
              <PixelText text="VENCE" x={134} y={83} fill="#ffffff80" />
              <CardText
                x={134}
                y={98}
                size={6}
                value={expiry}
                rest={'MM/AA'.slice(expiry.length)}
              />

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
                    <rect x={x - 2} y={y} width={5} height={1} fill={WHITE} />
                    <rect x={x} y={y - 2} width={1} height={5} fill={WHITE} />
                    <g fill="#ffffffaa">
                      <rect x={x - 1} y={y - 1} width={1} height={1} />
                      <rect x={x + 1} y={y - 1} width={1} height={1} />
                      <rect x={x - 1} y={y + 1} width={1} height={1} />
                      <rect x={x + 1} y={y + 1} width={1} height={1} />
                    </g>
                    <rect x={x} y={y} width={1} height={1} fill="#f7d44a" />
                  </g>
                ))}
            </g>
          </g>

          <g clipPath={`url(#${uid}-body)`}>
            {progress === 'scanning' && (
              <rect className="pc-scanline" width={W} height={3} fill="#fff" />
            )}
            {progress === 'complete' && (
              <polygon className="pc-glint" points="0,108 12,108 48,0 36,0" fill="#fff" />
            )}
          </g>
        </g>

        <g className="pc-face-back">
          <Notched x={0} y={0} w={W} h={H} r={CORNER} style={{ fill: outline }} />
          <SkinPlate skin={skin} uid={uid} />
          {/* Banda magnética con textura tramada. */}
          <rect x={1} y={12} width={W - 2} height={18} fill="#0d0d12" />
          <rect x={1} y={12} width={W - 2} height={18} fill="#26262e" mask={`url(#${uid}-lv4)`} />
          <rect x={1} y={12} width={W - 2} height={1} fill="#3a3a46" />
          <rect x={1} y={29} width={W - 2} height={1} fill={backShadow} />

          <PixelText text="FIRMA AUTORIZADA" x={12} y={35} fill="#ffffff80" />
          <rect x={12} y={42} width={108} height={16} fill="#ece8d8" />
          <rect x={12} y={42} width={108} height={16} fill={`url(#${uid}-diag)`} />
          <rect x={12} y={58} width={108} height={1} fill={backDark} />

          <PixelText text="CVV" x={124} y={35} fill="#ffffff80" />
          <rect x={124} y={42} width={32} height={16} fill={WHITE} />
          <rect x={124} y={42} width={32} height={1} fill="#b9bcc6" />
          <rect x={124} y={42} width={1} height={16} fill="#b9bcc6" />
          <text x={128} y={54} fontSize={6} className="font-mono" fill="#1a1a2a">
            {cvvMask}
            <tspan fill="#1a1a2a55">{cvvTemplate.slice(cvvLength)}</tspan>
          </text>

          <g fill="#ffffff40">
            <rect x={12} y={66} width={108} height={1} />
            <rect x={12} y={70} width={96} height={1} />
            <rect x={12} y={74} width={84} height={1} />
          </g>

          {/* Holograma: los colores ciclan corriendo una franja repetida dentro del recorte. */}
          <g clipPath={`url(#${uid}-holo)`}>
            <g className="pc-holo">
              {Array.from({ length: 12 }, (_, i) => (
                <rect
                  key={i}
                  x={136 + i * 4}
                  y={72}
                  width={4}
                  height={16}
                  fill={rainbow[i % rainbow.length]}
                />
              ))}
            </g>
            <rect x={136} y={72} width={24} height={16} fill="#fff" mask={`url(#${uid}-lv4)`} />
            <rect x={136} y={72} width={24} height={1} fill="#ffffffaa" />
            <rect x={136} y={87} width={24} height={1} fill="#00000055" />
          </g>
        </g>
      </svg>
    </div>
  );
}
