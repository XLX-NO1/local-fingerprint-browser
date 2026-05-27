export function buildAudioModuleScript(): string {
  return `
  if (typeof AudioBuffer !== 'undefined' && AudioBuffer.prototype.getChannelData) {
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function getChannelData(channel) {
      const data = originalGetChannelData.call(this, channel);
      if (data && data.length > 0) {
        const index = fp.audioSeed % data.length;
        data[index] = data[index] + 0.0000001;
      }
      return data;
    };
  }
`;
}
