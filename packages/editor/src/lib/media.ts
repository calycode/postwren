export type UploadedImage = {
   url: string;
   /** Optional alt text derived by the host (for example from the file name). */
   alt?: string;
};

/**
 * Host-provided image upload. The editor never talks to storage itself; the
 * admin app injects this so the editor package stays free of API imports.
 */
export type ImageUploader = (file: File) => Promise<UploadedImage>;
