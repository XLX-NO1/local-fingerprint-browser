import type { FingerprintConfig } from '../../src/types';
import { generateFingerprintConfig } from './fingerprint/model';
export { buildFingerprintPreloadScript } from './fingerprint/scriptBuilder';

export function generateFingerprint(seed: string): FingerprintConfig {
  return generateFingerprintConfig(seed);
}
