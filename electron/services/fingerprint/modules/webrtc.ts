export function buildWebRtcModuleScript(): string {
  return `
  const filterCandidateEvent = (event) => {
    if (!event || !event.candidate || !event.candidate.candidate) {
      return event;
    }
    const candidate = event.candidate.candidate;
    if (candidate.includes(' typ host ') || candidate.includes(' typ srflx ')) {
      return null;
    }
    return event;
  };
  if (fp.webrtcPolicy === 'disabled') {
    try {
      Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitRTCPeerConnection', { value: undefined, configurable: true });
    } catch {}
  }
  if (fp.webrtcPolicy === 'proxy-only') {
    const OriginalPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (OriginalPeerConnection) {
      const PatchedPeerConnection = function RTCPeerConnection(configuration, constraints) {
        const pc = new OriginalPeerConnection(configuration, constraints);
        const originalAddEventListener = pc.addEventListener.bind(pc);
        pc.addEventListener = function addEventListener(type, listener, options) {
          if (type !== 'icecandidate' || typeof listener !== 'function') {
            return originalAddEventListener(type, listener, options);
          }
          return originalAddEventListener(type, function wrappedIceCandidate(event) {
            const filtered = filterCandidateEvent(event);
            if (filtered) {
              listener.call(this, filtered);
            }
          }, options);
        };
        let onicecandidateHandler = null;
        Object.defineProperty(pc, 'onicecandidate', {
          get: () => onicecandidateHandler,
          set: (handler) => {
            onicecandidateHandler = typeof handler === 'function'
              ? function wrappedOnIceCandidate(event) {
                const filtered = filterCandidateEvent(event);
                if (filtered) {
                  handler.call(this, filtered);
                }
              }
              : handler;
          },
          configurable: true
        });
        return pc;
      };
      PatchedPeerConnection.prototype = OriginalPeerConnection.prototype;
      try {
        Object.defineProperty(window, 'RTCPeerConnection', { value: PatchedPeerConnection, configurable: true });
        Object.defineProperty(window, 'webkitRTCPeerConnection', { value: PatchedPeerConnection, configurable: true });
      } catch {}
    }
  }
`;
}
