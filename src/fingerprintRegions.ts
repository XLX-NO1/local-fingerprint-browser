import type { FingerprintConfig } from './types';
import { generateLocalFingerprint } from './localFingerprint';

export type RegionCode = 'US' | 'JP' | 'DE' | 'CN' | 'GB' | 'FR' | 'SG' | 'HK';

export interface RegionPreset {
  countryCode: RegionCode;
  label: string;
  languages: string[];
  timezone: string;
}

export const REGION_PRESETS: RegionPreset[] = [
  { countryCode: 'US', label: 'United States', languages: ['en-US', 'en'], timezone: 'America/New_York' },
  { countryCode: 'JP', label: 'Japan', languages: ['ja-JP', 'ja', 'en-US'], timezone: 'Asia/Tokyo' },
  { countryCode: 'DE', label: 'Germany', languages: ['de-DE', 'de', 'en-US'], timezone: 'Europe/Berlin' },
  { countryCode: 'CN', label: 'China', languages: ['zh-CN', 'zh', 'en-US'], timezone: 'Asia/Shanghai' },
  { countryCode: 'GB', label: 'United Kingdom', languages: ['en-GB', 'en'], timezone: 'Europe/London' },
  { countryCode: 'FR', label: 'France', languages: ['fr-FR', 'fr', 'en-US'], timezone: 'Europe/Paris' },
  { countryCode: 'SG', label: 'Singapore', languages: ['en-SG', 'en', 'zh-CN'], timezone: 'Asia/Singapore' },
  { countryCode: 'HK', label: 'Hong Kong', languages: ['zh-HK', 'zh', 'en-US'], timezone: 'Asia/Hong_Kong' },
];

export function regionPresetByCode(countryCode: string): RegionPreset {
  return REGION_PRESETS.find((preset) => preset.countryCode === countryCode) ?? REGION_PRESETS[0];
}

export function inferRegionFromFingerprint(fingerprint: FingerprintConfig): RegionCode {
  const timezoneMatch = REGION_PRESETS.find((preset) => preset.timezone === fingerprint.timezone);
  if (timezoneMatch) {
    return timezoneMatch.countryCode;
  }
  const languageMatch = REGION_PRESETS.find((preset) => preset.languages[0] === fingerprint.languages[0]);
  return languageMatch?.countryCode ?? 'US';
}

export function applyRegionToFingerprint(fingerprint: FingerprintConfig, countryCode: string): FingerprintConfig {
  const preset = regionPresetByCode(countryCode);
  return {
    ...fingerprint,
    languages: preset.languages,
    timezone: preset.timezone,
  };
}

export function generateFingerprintForRegion(countryCode: string, seed: string): FingerprintConfig {
  return applyRegionToFingerprint(generateLocalFingerprint(`${seed}:${countryCode}`), countryCode);
}
