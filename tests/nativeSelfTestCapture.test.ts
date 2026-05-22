import { describe, expect, it } from 'vitest';
import { buildNativeSelfTestCaptureScript } from '../electron/services/selfTestResult';

describe('buildNativeSelfTestCaptureScript', () => {
  it('waits for the async self-test page result before returning', () => {
    const script = buildNativeSelfTestCaptureScript();

    expect(script).toContain('__LOCAL_FINGERPRINT_SELF_TEST_RESULT__');
    expect(script).toContain('result.complete');
    expect(script).toContain('setTimeout(check, 150)');
    expect(script).toContain('Date.now() - startedAt > 5000');
  });
});
