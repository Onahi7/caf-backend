const FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:4202',
  'http://localhost:3000',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'https://caf-frontend-one.vercel.app',
  'https://caf-frontend.dicksonhardy7.workers.dev',
  'https://caf-three-green.vercel.app',
  'https://field.carefam.xyz',
  'https://caf-marketer.pages.dev',
];

export function getAllowedOrigins(configuredOrigins = ''): string[] {
  return [...new Set([
    ...FRONTEND_ORIGINS,
    ...configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean),
  ])];
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  // Native clients and server-to-server calls may omit Origin.
  return !origin || allowedOrigins.includes(origin);
}
