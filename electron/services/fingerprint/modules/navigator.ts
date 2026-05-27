export function buildNavigatorModuleScript(): string {
  return `
  defineGetter(Navigator.prototype, 'userAgent', fp.userAgent);
  defineGetter(Navigator.prototype, 'platform', fp.platform);
  defineGetter(Navigator.prototype, 'languages', fp.languages);
  defineGetter(Navigator.prototype, 'language', fp.languages[0]);
  defineGetter(Navigator.prototype, 'hardwareConcurrency', fp.hardwareConcurrency);
  defineGetter(Navigator.prototype, 'deviceMemory', fp.deviceMemory);
  defineGetter(Navigator.prototype, 'webdriver', undefined);
  defineGetter(Navigator.prototype, 'userAgentData', {
    brands: uaMetadata.brands,
    mobile: uaMetadata.mobile,
    platform: uaMetadata.platform,
    getHighEntropyValues: async (hints) => {
      const values = {
        architecture: uaMetadata.architecture,
        bitness: uaMetadata.bitness,
        model: uaMetadata.model,
        platform: uaMetadata.platform,
        platformVersion: uaMetadata.platformVersion,
        uaFullVersion: uaMetadata.uaFullVersion,
        fullVersionList: uaMetadata.fullVersionList
      };
      return hints.reduce((acc, hint) => ({ ...acc, [hint]: values[hint] }), {});
    }
  });
`;
}
