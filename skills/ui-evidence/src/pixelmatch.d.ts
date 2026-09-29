declare module "pixelmatch" {
  export interface PixelmatchOptions {
    threshold?: number;
    includeAA?: boolean;
    alpha?: number;
    diffMask?: boolean;
  }
  export default function pixelmatch(img1: Uint8Array, img2: Uint8Array, output: Uint8Array | null, width: number, height: number, options?: PixelmatchOptions): number;
}
