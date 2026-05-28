declare namespace JSX {
  type ElectronWebviewElement = HTMLElement & {
    executeJavaScript<T = unknown>(code: string): Promise<T>;
    getWebContentsId(): number;
    setZoomFactor(factor: number): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
    getURL(): string;
    getTitle(): string;
  };

  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      partition?: string;
      useragent?: string;
      allowpopups?: boolean;
      ref?: React.Ref<ElectronWebviewElement>;
    };
  }
}
