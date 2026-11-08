import { useRef, useState } from 'react';
import { Button, Field, Input } from '@postwren/ui';
import { Images, Upload } from 'lucide-react';
import { imageSrcIssue } from '../lib/controls';
import type { ImagePicker, ImageUploader } from '../lib/media';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type MediaFieldProps = {
   id: string;
   label: string;
   value: string;
   onValueChange: (value: string) => void;
   onUploadImage?: ImageUploader;
   onPickImage?: ImagePicker;
};

export function MediaField({
   id,
   label,
   value,
   onValueChange,
   onUploadImage,
   onPickImage,
}: MediaFieldProps) {
   const fileRef = useRef<HTMLInputElement>(null);
   const [uploading, setUploading] = useState(false);
   const [uploadError, setUploadError] = useState<string | null>(null);

   const upload = async (file: File) => {
      if (!onUploadImage) return;

      if (file.size > MAX_IMAGE_BYTES) {
         setUploadError('Images must be 5 MB or smaller');
         return;
      }

      setUploading(true);
      setUploadError(null);
      try {
         const uploaded = await onUploadImage(file);
         onValueChange(uploaded.url);
      } catch (cause) {
         setUploadError(cause instanceof Error ? cause.message : 'Upload failed');
      } finally {
         setUploading(false);
      }
   };

   const pickFromLibrary = async () => {
      if (!onPickImage) return;
      setUploadError(null);
      try {
         const picked = await onPickImage();
         if (picked !== null) onValueChange(picked.url);
      } catch (cause) {
         setUploadError(cause instanceof Error ? cause.message : 'Could not open the library');
      }
   };

   const error = uploadError ?? imageSrcIssue(value);

   return (
      <Field
         label={label}
         htmlFor={id}
         error={error}
      >
         <div className="flex items-center gap-1">
            <Input
               id={id}
               value={value}
               aria-invalid={error ? true : undefined}
               onInput={(event) => {
                  setUploadError(null);
                  onValueChange(event.currentTarget.value);
               }}
            />
            {onPickImage && (
               <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={uploading}
                  title="Choose from the media library"
                  onClick={() => void pickFromLibrary()}
               >
                  <Images className="size-3.5" />
                  Library
               </Button>
            )}
            {onUploadImage && (
               <>
                  <Button
                     variant="outline"
                     size="sm"
                     className="shrink-0"
                     disabled={uploading}
                     aria-busy={uploading}
                     onClick={() => fileRef.current?.click()}
                  >
                     <Upload className="size-3.5" />
                     {uploading ? 'Uploading…' : 'Upload'}
                  </Button>
                  <input
                     ref={fileRef}
                     type="file"
                     accept="image/*"
                     className="hidden"
                     aria-label={`Upload ${label}`}
                     onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = '';
                        if (file) void upload(file);
                     }}
                  />
               </>
            )}
         </div>
      </Field>
   );
}
