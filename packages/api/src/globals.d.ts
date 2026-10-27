// A global `var` is the only declaration form TypeScript includes on `globalThis`;
// workers-types declares `crypto` as a `const`, which makes `globalThis.crypto` untyped.
// eslint-disable-next-line no-var
declare var crypto: Crypto;

declare class TextDecoder {
   constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
   decode(input?: ArrayBuffer | ArrayBufferView, options?: TextDecoderDecodeOptions): string;
   readonly encoding: string;
   readonly fatal: boolean;
   readonly ignoreBOM: boolean;
}
