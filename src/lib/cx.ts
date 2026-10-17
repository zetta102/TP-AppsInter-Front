/** Une clases de Tailwind ignorando los valores falsy, sin espacios sobrantes. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
