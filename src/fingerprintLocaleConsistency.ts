import type { FingerprintConfig } from './types';

export interface LocaleNetworkInfo {
  proxyConfigured?: boolean;
  publicIp?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  timezone?: string | null;
  error?: string | null;
}

export interface LocaleConsistencyCheck {
  key: string;
  label: string;
  passed: boolean;
  expected: string;
  observed: string;
  severity?: 'warning' | 'risk';
}

export interface LocaleConsistencyReport {
  score: number;
  status: 'ok' | 'warning' | 'risk';
  summary: string;
  checks: LocaleConsistencyCheck[];
}

const TIMEZONE_COUNTRIES: Record<string, string> = {
  'America/New_York': 'US',
  'America/Los_Angeles': 'US',
  'America/Chicago': 'US',
  'Asia/Tokyo': 'JP',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/London': 'GB',
  'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Singapore': 'SG',
  UTC: 'US',
};

const LANGUAGE_COUNTRIES: Record<string, string> = {
  'en-US': 'US',
  'en-GB': 'GB',
  'ja-JP': 'JP',
  'de-DE': 'DE',
  'fr-FR': 'FR',
  'zh-CN': 'CN',
  'zh-HK': 'HK',
  'zh-TW': 'TW',
};

export function buildLocaleConsistencyReport({
  fingerprint,
  network,
}: {
  fingerprint: FingerprintConfig;
  network?: LocaleNetworkInfo;
}): LocaleConsistencyReport {
  const timezoneCountry = countryFromTimezone(fingerprint.timezone);
  const languageCountry = countryFromLanguage(fingerprint.languages[0]);
  const networkCountry = normalizeCountry(network?.countryCode);
  const networkTimezone = network?.timezone ?? null;

  const checks: LocaleConsistencyCheck[] = [];
  if (networkCountry && !network?.proxyConfigured && (timezoneCountry !== networkCountry || languageCountry !== networkCountry)) {
    checks.push({
      key: 'networkMode',
      label: 'direct network matches profile country',
      passed: false,
      expected: timezoneCountry ?? languageCountry ?? 'profile country',
      observed: networkCountry,
      severity: 'risk',
    });
  }
  if (!networkCountry) {
    checks.push({
      key: 'proxyGeo',
      label: network?.proxyConfigured ? 'proxy country detected' : 'network country detected',
      passed: false,
      expected: timezoneCountry ?? languageCountry ?? 'known country',
      observed: network?.publicIp ? 'country unavailable' : 'ip unavailable',
      severity: 'warning',
    });
    checks.push({
      key: 'timezoneLanguage',
      label: 'timezone matches language',
      passed: Boolean(timezoneCountry && languageCountry) && timezoneCountry === languageCountry,
      expected: timezoneCountry ?? 'unknown',
      observed: languageCountry ?? 'unknown',
      severity: timezoneCountry === languageCountry ? undefined : 'warning',
    });
  } else {
    checks.push({
      key: 'timezoneCountry',
      label: 'timezone matches country',
      passed: timezoneCountry === networkCountry,
      expected: timezoneCountry ?? 'unknown',
      observed: networkCountry,
      severity: timezoneCountry === networkCountry ? undefined : 'risk',
    });
    checks.push({
      key: 'languageCountry',
      label: 'language matches country',
      passed: languageCountry === networkCountry,
      expected: languageCountry ?? 'unknown',
      observed: networkCountry,
      severity: languageCountry === networkCountry ? undefined : 'risk',
    });
  }

  checks.push({
    key: 'networkTimezone',
    label: 'network timezone matches profile',
    passed: networkTimezone ? networkTimezone === fingerprint.timezone : !network?.proxyConfigured,
    expected: fingerprint.timezone,
    observed: networkTimezone ?? (network?.proxyConfigured ? 'unavailable' : 'not checked in direct mode'),
    severity: networkTimezone === fingerprint.timezone ? undefined : networkTimezone ? 'risk' : 'warning',
  });

  const passed = checks.filter((check) => check.passed).length;
  const score = checks.length === 0 ? 0 : Math.round((passed / checks.length) * 100);
  const hasRisk = checks.some((check) => !check.passed && check.severity === 'risk');

  return {
    score,
    status: hasRisk ? 'risk' : score === 100 ? 'ok' : 'warning',
    summary: `${passed}/${checks.length} locale checks ok`,
    checks,
  };
}

function countryFromTimezone(timezone: string): string | undefined {
  return TIMEZONE_COUNTRIES[timezone] ?? timezone.split('/')[0]?.toUpperCase();
}

function countryFromLanguage(language: string | undefined): string | undefined {
  if (!language) {
    return undefined;
  }
  const normalized = language.trim();
  if (LANGUAGE_COUNTRIES[normalized]) {
    return LANGUAGE_COUNTRIES[normalized];
  }
  const region = normalized.split('-')[1];
  return region ? normalizeCountry(region) : undefined;
}

function normalizeCountry(country: string | null | undefined): string | undefined {
  const normalized = country?.trim().toUpperCase();
  return normalized || undefined;
}
