import { getAllowedOrigins, isOriginAllowed } from './cors.util';

describe('frontend CORS policy', () => {
  const origins = getAllowedOrigins(' https://custom.example, ,https://custom.example ');

  it.each([
    'https://caf-frontend-one.vercel.app',
    'https://caf-marketer.pages.dev',
    'http://localhost:5175',
    'https://field.carefam.xyz',
    'capacitor://localhost',
    'https://custom.example',
    undefined,
  ])('allows the supported origin %s', (origin) => {
    expect(isOriginAllowed(origin, origins)).toBe(true);
  });

  it.each([
    'https://unrelated.pages.dev',
    'https://unrelated.workers.dev',
    'https://caf-marketer.pages.dev.evil.example',
    'http://caf-marketer.pages.dev',
    'null',
  ])('rejects an unconfigured origin %s', (origin) => {
    expect(isOriginAllowed(origin, origins)).toBe(false);
  });

  it('does not treat a configured wildcard as permission for every site', () => {
    expect(isOriginAllowed('https://unrelated.pages.dev', getAllowedOrigins('*'))).toBe(false);
  });

  it('deduplicates configured origins and ignores blank entries', () => {
    expect(origins.filter((origin) => origin === 'https://custom.example')).toHaveLength(1);
    expect(origins).not.toContain('');
  });
});
