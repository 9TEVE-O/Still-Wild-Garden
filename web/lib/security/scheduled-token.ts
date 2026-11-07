/**
 * Fail closed when a scheduled-job credential is unset or obviously too short.
 * Length is a minimum guard, not a substitute for generating a random secret.
 */
export function isConfiguredScheduledToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32;
}

/**
 * Preserve the endpoint's exact Bearer syntax; avoid value-dependent early exits
 * while comparing credentials of equal length.
 */
export function matchesScheduledBearer(header: string | null, secret: string): boolean {
  if (!isConfiguredScheduledToken(secret) || !header?.startsWith("Bearer ")) return false;
  const candidate = header.slice("Bearer ".length);
  if (candidate.length !== secret.length) return false;

  let difference = 0;
  for (let i = 0; i < secret.length; i += 1) {
    difference |= candidate.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return difference === 0;
}
