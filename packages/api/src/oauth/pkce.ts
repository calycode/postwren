const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isPkceVerifier(value: string): boolean {
   return VERIFIER_PATTERN.test(value);
}

export function base64UrlEncode(bytes: Uint8Array): string {
   let binary = '';
   for (const byte of bytes) {
      binary += String.fromCharCode(byte);
   }
   return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkceChallenge(verifier: string): Promise<string> {
   const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
   return base64UrlEncode(new Uint8Array(digest));
}

export async function verifyPkce(
   verifier: string,
   challenge: string,
   method: string,
): Promise<boolean> {
   if (method !== 'S256' || !isPkceVerifier(verifier)) {
      return false;
   }
   return (await pkceChallenge(verifier)) === challenge;
}
