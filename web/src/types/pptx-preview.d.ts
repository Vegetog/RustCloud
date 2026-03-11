declare module 'pptx-preview' {
  export interface PreviewerOptions {
    renderer?: string;
    width?: number;
    height?: number;
    mode?: 'list' | 'slide';
  }

  export interface PptxPreviewer {
    preview(file: ArrayBuffer): Promise<unknown>;
    destroy(): void;
    slideCount: number;
  }

  export function init(dom: HTMLElement, options?: PreviewerOptions): PptxPreviewer;
}
