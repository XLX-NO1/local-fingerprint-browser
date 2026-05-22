declare namespace JSX {
  type ElectronWebviewElement = HTMLElement & {
    executeJavaScript<T = unknown>(code: string): Promise<T>;
    getWebContentsId(): number;
    setZoomFactor(factor: number): void;
  };

  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      partition?: string;
      allowpopups?: boolean;
      ref?: React.Ref<ElectronWebviewElement>;
    };
  }
}
