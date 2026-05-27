import type { BrowserProfile, FingerprintConfig } from '../../src/types';
import { buildCdpSetupCommands, type CdpCommand } from './cdpClient';
import {
  fingerprintConfigFromHardwareProfile,
  normalizeFingerprintConfig,
  type HardwareFingerprintProfile,
  type UserAgentMetadata,
} from './fingerprint/model';

export interface FingerprintRuntimeInput {
  id: BrowserProfile['id'];
  fingerprint: FingerprintConfig;
}

export interface FingerprintRuntimeProfile {
  profile: HardwareFingerprintProfile;
  legacyConfig: FingerprintConfig;
  acceptLanguage: string;
  userAgentMetadata: UserAgentMetadata;
}

export interface FingerprintRuntimeCdpInput extends FingerprintRuntimeInput {
  preloadScript: string;
  navigateUrl?: string;
  includeDeviceMetrics?: boolean;
}

export function buildFingerprintRuntimeProfile(input: FingerprintRuntimeInput): FingerprintRuntimeProfile {
  const profile = normalizeFingerprintConfig(input.fingerprint, input.id);
  return {
    profile,
    legacyConfig: fingerprintConfigFromHardwareProfile(profile),
    acceptLanguage: profile.derived.acceptLanguage,
    userAgentMetadata: profile.derived.userAgentMetadata,
  };
}

export function buildFingerprintRuntimeCdpCommands(input: FingerprintRuntimeCdpInput): CdpCommand[] {
  const runtime = buildFingerprintRuntimeProfile(input);
  return buildCdpSetupCommands(runtime.legacyConfig, input.preloadScript, input.navigateUrl, {
    includeDeviceMetrics: input.includeDeviceMetrics,
  });
}
