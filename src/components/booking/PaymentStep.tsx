import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { Ref } from 'react';
import {
  acceptedBrands,
  cardBrands,
  cardFields,
  cardProgress,
  cvvLengthFor,
  detectBrand,
  formatCardNumber,
  formatExpiry,
  onlyDigits,
  validateCard,
  type CardInput,
  type CardKind,
} from '../../lib/card.ts';
import { TextInput } from '../ui/Field.tsx';
import { PixelCard } from './PixelCard.tsx';

/**
 * Paso de pago del checkout: los datos de la tarjeta con validación en vivo y la tarjeta de 16
 * bits que se transforma según la marca.
 *
 * Los valores son controlados (`Checkout` los conserva al volver al pedido) porque se formatean
 * mientras se escriben y alimentan la animación. Cada campo muestra su error recién al salir
 * de él, o todos tras un intento de envío; desde ahí se revalidan con cada cambio. El envío lo
 * valida de nuevo `Checkout`, con los mismos `validateCard` y nombres de campo (`cardFields`).
 */

export interface CardForm extends CardInput {
  readonly kind: CardKind;
}

export const emptyCardForm: CardForm = {
  number: '',
  name: '',
  expiry: '',
  cvv: '',
  kind: 'credit',
};

const kindOptions: readonly { readonly value: CardKind; readonly label: string }[] = [
  { value: 'credit', label: 'Crédito' },
  { value: 'debit', label: 'Débito' },
];

type CardField = (typeof cardFields)[keyof typeof cardFields];

/** Orden visual de los campos: el primero con error recibe el foco tras un envío fallido. */
const fieldOrder: readonly CardField[] = [
  cardFields.number,
  cardFields.name,
  cardFields.expiry,
  cardFields.cvv,
  cardFields.kind,
];

export interface PaymentStepProps {
  readonly value: CardForm;
  readonly onChange: (next: CardForm) => void;
  /** Errores del último envío: muestran todos los campos y enfocan el primero inválido. */
  readonly submittedErrors: Readonly<Record<string, string>>;
  readonly now: number;
  readonly headingRef: Ref<HTMLHeadingElement>;
}

export function PaymentStep({
  value,
  onChange,
  submittedErrors,
  now,
  headingRef,
}: PaymentStepProps) {
  const [touched, setTouched] = useState<ReadonlySet<CardField>>(new Set());
  const [cvvFocused, setCvvFocused] = useState(false);
  const kindErrorId = useId();

  // Cada `useRef` va suelto en el nivel superior: dentro de un objeto literal, el React Compiler
  // memoiza el objeto y deja de llamarlos en los renders siguientes (cambia el orden de los hooks).
  const numberRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const cvvRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<HTMLInputElement>(null);
  const refs = {
    [cardFields.number]: numberRef,
    [cardFields.name]: nameRef,
    [cardFields.expiry]: expiryRef,
    [cardFields.cvv]: cvvRef,
    [cardFields.kind]: kindRef,
  };

  // Cada envío fallido trae un objeto nuevo: se enfoca el primer campo a corregir.
  const focusFirstError = useEffectEvent((errors: Readonly<Record<string, string>>) => {
    const first = fieldOrder.find((field) => errors[field]);
    if (first) refs[first].current?.focus();
  });
  useEffect(() => focusFirstError(submittedErrors), [submittedErrors]);

  const digits = onlyDigits(value.number);
  const brand = detectBrand(digits);
  const progress = cardProgress(digits);
  const liveErrors = validateCard(value, new Date(now));
  const showAll = Object.keys(submittedErrors).length > 0;
  const errorFor = (field: CardField) =>
    showAll || touched.has(field) ? liveErrors[field] : undefined;

  const touch = (field: CardField) => {
    if (!touched.has(field)) setTouched(new Set(touched).add(field));
  };
  const update = (patch: Partial<CardForm>) => onChange({ ...value, ...patch });

  const status = brand
    ? `Tarjeta ${cardBrands[brand].name}${progress === 'complete' ? ' · número completo' : ''}`
    : digits.length > 0
      ? 'Identificando la tarjeta…'
      : 'Escribí el número para identificar la tarjeta.';

  const kindError = errorFor(cardFields.kind);

  return (
    <section className="flex flex-col gap-5 cine-card p-5">
      <header className="flex flex-col gap-1">
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
          Datos de la tarjeta
        </h2>
        <p className="text-xs text-ink-500">
          Pago simulado: los datos se validan en tu navegador y no se envían ni se guardan. Podés
          probar con 4111 1111 1111 1111.
        </p>
      </header>

      <div className="flex flex-col items-center gap-6 xl:flex-row xl:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <PixelCard
            digits={digits}
            name={value.name}
            expiry={value.expiry}
            cvvLength={value.cvv.length}
            kind={value.kind}
            cvvFocused={cvvFocused}
          />
          <p aria-live="polite" className="text-center text-sm text-ink-300">
            {status}
          </p>
          <p className="max-w-[344px] text-center text-xs text-ink-500">
            Aceptamos {acceptedBrands}.
          </p>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2">
          <TextInput
            ref={refs[cardFields.number]}
            label="Número de tarjeta"
            name={cardFields.number}
            value={value.number}
            onChange={(event) => update({ number: formatCardNumber(event.target.value) })}
            onBlur={() => touch(cardFields.number)}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            spellCheck={false}
            required
            error={errorFor(cardFields.number)}
            fieldClassName="sm:col-span-2"
          />

          <TextInput
            ref={refs[cardFields.name]}
            label="Nombre del titular"
            name={cardFields.name}
            value={value.name}
            onChange={(event) => update({ name: event.target.value })}
            onBlur={() => touch(cardFields.name)}
            autoComplete="cc-name"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={26}
            required
            hint="Como figura en la tarjeta."
            error={errorFor(cardFields.name)}
            fieldClassName="sm:col-span-2"
          />

          <TextInput
            ref={refs[cardFields.expiry]}
            label="Vencimiento"
            name={cardFields.expiry}
            value={value.expiry}
            onChange={(event) => update({ expiry: formatExpiry(event.target.value) })}
            onBlur={() => touch(cardFields.expiry)}
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            required
            error={errorFor(cardFields.expiry)}
          />

          <TextInput
            ref={refs[cardFields.cvv]}
            label="Código de seguridad"
            name={cardFields.cvv}
            type="password"
            value={value.cvv}
            onChange={(event) =>
              update({ cvv: onlyDigits(event.target.value).slice(0, cvvLengthFor(brand)) })
            }
            onFocus={() => setCvvFocused(true)}
            onBlur={() => {
              setCvvFocused(false);
              touch(cardFields.cvv);
            }}
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={cvvLengthFor(brand)}
            required
            hint={
              brand === 'amex'
                ? '4 dígitos en el frente de la tarjeta.'
                : '3 dígitos al dorso de la tarjeta.'
            }
            error={errorFor(cardFields.cvv)}
          />

          <fieldset
            className="sm:col-span-2"
            aria-describedby={kindError ? kindErrorId : undefined}
          >
            <legend className="cine-label">
              Tipo de tarjeta
              <span aria-hidden="true" className="ml-1 text-virus-400">
                *
              </span>
            </legend>
            <div className="flex flex-wrap gap-4">
              {kindOptions.map((option, index) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input
                    {...(index === 0 ? { ref: refs[cardFields.kind] } : {})}
                    type="radio"
                    name={cardFields.kind}
                    value={option.value}
                    checked={value.kind === option.value}
                    onChange={() => update({ kind: option.value })}
                    required
                    className="size-4 accent-brand-500"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {kindError && (
              <p id={kindErrorId} role="alert" className="mt-1 text-xs text-virus-400">
                {kindError}
              </p>
            )}
          </fieldset>
        </div>
      </div>
    </section>
  );
}
