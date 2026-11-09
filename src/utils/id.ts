/**
 * `crypto.randomUUID` есть только в secure context: на http-адресе, кроме localhost,
 * его нет. `getRandomValues` доступен везде, его и используем как запасной вариант.
 */
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  return Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
