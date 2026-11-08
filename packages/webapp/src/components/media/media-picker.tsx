import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Search, Trash2 } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   Button,
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
   Input,
   Skeleton,
} from '@postwren/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { list, remove, upload } from '@/lib/api/media';
import type { MediaAsset } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import { formatDate } from '@/lib/format';

const MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Small media library: list, upload, search and pick. It only talks to the
 * workspace's own `/api/v1/media` endpoints, so it works with R2 and has no
 * external service to configure.
 */
export function MediaPickerDialog({
   open,
   onOpenChange,
   onSelect,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onSelect: (asset: MediaAsset) => void;
}) {
   const fileRef = useRef<HTMLInputElement>(null);
   const [items, setItems] = useState<MediaAsset[]>([]);
   const [cursor, setCursor] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [query, setQuery] = useState('');
   const [uploading, setUploading] = useState(false);
   const [dragging, setDragging] = useState(false);
   const [deleting, setDeleting] = useState<MediaAsset | null>(null);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const [deleteError, setDeleteError] = useState<string | null>(null);

   useEffect(() => {
      if (!open) return;
      let cancelled = false;
      setLoading(true);
      setError(null);
      list()
         .then((result) => {
            if (cancelled) return;
            setItems(result.items);
            setCursor(result.cursor);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load the media library'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [open]);

   async function loadMore() {
      if (cursor === null) return;
      setLoading(true);
      try {
         const result = await list(cursor);
         setItems((current) => [...current, ...result.items]);
         setCursor(result.cursor);
      } catch (cause) {
         setError(errorMessage(cause, 'Could not load more images'));
      } finally {
         setLoading(false);
      }
   }

   async function uploadFiles(files: FileList | File[]) {
      const list_ = Array.from(files);
      setUploading(true);
      setError(null);
      try {
         for (const file of list_) {
            if (!file.type.startsWith('image/')) {
               setError(`${file.name} is not an image.`);
               continue;
            }
            if (file.size > MAX_BYTES) {
               setError(`${file.name} is larger than 5 MB.`);
               continue;
            }
            const asset = await upload(file);
            setItems((current) => [asset, ...current]);
         }
      } catch (cause) {
         setError(errorMessage(cause, 'Upload failed'));
      } finally {
         setUploading(false);
      }
   }

   async function confirmDelete() {
      if (deleting === null) return;
      setDeleteBusy(true);
      setDeleteError(null);
      try {
         await remove(deleting.key);
         setItems((current) => current.filter((item) => item.key !== deleting.key));
         setDeleting(null);
      } catch (cause) {
         setDeleteError(errorMessage(cause, 'Could not delete the image'));
      } finally {
         setDeleteBusy(false);
      }
   }

   const needle = query.trim().toLowerCase();
   const visible =
      needle.length === 0
         ? items
         : items.filter((item) => item.name.toLowerCase().includes(needle));

   return (
      <>
         <Dialog
            open={open}
            onOpenChange={onOpenChange}
         >
            <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-3xl">
               <DialogHeader>
                  <DialogTitle>Media library</DialogTitle>
                  <DialogDescription>
                     Images uploaded to this workspace. Pick one for the block, or add a new file.
                  </DialogDescription>
               </DialogHeader>

               <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                     <Search
                        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                     />
                     <Input
                        aria-label="Search images"
                        placeholder="Search by file name"
                        value={query}
                        className="h-8 pl-8 text-xs"
                        onInput={(event) => setQuery(event.currentTarget.value)}
                     />
                  </div>
                  <Button
                     variant="outline"
                     size="sm"
                     disabled={uploading}
                     onClick={() => fileRef.current?.click()}
                  >
                     <ImagePlus aria-hidden="true" />
                     {uploading ? 'Uploading…' : 'Upload'}
                  </Button>
                  <input
                     ref={fileRef}
                     type="file"
                     accept="image/*"
                     multiple
                     className="hidden"
                     aria-label="Upload images"
                     onChange={(event) => {
                        const files = event.currentTarget.files;
                        event.currentTarget.value = '';
                        if (files !== null) void uploadFiles(files);
                     }}
                  />
               </div>

               {error !== null && (
                  <Alert variant="destructive">
                     <AlertDescription>{error}</AlertDescription>
                  </Alert>
               )}

               <div
                  onDragOver={(event) => {
                     event.preventDefault();
                     setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                     event.preventDefault();
                     setDragging(false);
                     const files = event.dataTransfer?.files;
                     if (files !== undefined && files.length > 0) {
                        void uploadFiles(files);
                     }
                  }}
                  className={
                     dragging
                        ? 'grid gap-3 rounded-lg border-2 border-dashed border-ochre/60 bg-ochre/5 p-3'
                        : 'grid gap-3 rounded-lg border border-transparent'
                  }
               >
                  {loading && items.length === 0 ? (
                     <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {Array.from({ length: 8 }, (_, index) => (
                           <Skeleton
                              key={index}
                              className="aspect-square rounded-lg"
                           />
                        ))}
                     </div>
                  ) : visible.length === 0 ? (
                     <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                        {needle.length > 0
                           ? `No images match "${query.trim()}".`
                           : 'No images yet. Upload one or drop it here.'}
                     </p>
                  ) : (
                     <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {visible.map((item) => (
                           <li
                              key={item.key}
                              className="group relative"
                           >
                              <button
                                 type="button"
                                 onClick={() => onSelect(item)}
                                 className="grid w-full gap-1 rounded-lg border border-border bg-background p-1.5 text-left outline-none transition-colors hover:border-ochre/60 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring"
                                 title={item.name}
                              >
                                 <img
                                    src={item.url}
                                    alt={item.name}
                                    loading="lazy"
                                    className="aspect-square w-full rounded-md object-cover"
                                 />
                                 <span className="truncate text-[11px] font-medium">
                                    {item.name}
                                 </span>
                                 <span className="text-[10px] text-muted-foreground">
                                    {formatBytes(item.size)}
                                    {item.uploadedAt === undefined
                                       ? ''
                                       : ` · ${formatDate(Date.parse(item.uploadedAt) / 1000)}`}
                                 </span>
                              </button>
                              <Button
                                 variant="ghost"
                                 size="icon"
                                 aria-label={`Delete ${item.name}`}
                                 className="absolute top-2 right-2 size-6 bg-background/80 text-muted-foreground opacity-0 backdrop-blur-sm group-hover:opacity-100 hover:text-destructive"
                                 onClick={() => {
                                    setDeleteError(null);
                                    setDeleting(item);
                                 }}
                              >
                                 <Trash2 aria-hidden="true" />
                              </Button>
                           </li>
                        ))}
                     </ul>
                  )}
               </div>

               {cursor !== null && (
                  <div className="flex justify-center">
                     <Button
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        onClick={() => void loadMore()}
                     >
                        {loading ? 'Loading…' : 'Load more'}
                     </Button>
                  </div>
               )}
            </DialogContent>
         </Dialog>

         <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(next) => {
               if (!next) setDeleting(null);
            }}
            title="Delete image"
            description={
               deleting === null
                  ? ''
                  : `Delete "${deleting.name}"? Emails that already use its URL will show a broken image.`
            }
            confirmLabel="Delete image"
            destructive
            loading={deleteBusy}
            error={deleteError}
            onConfirm={confirmDelete}
         />
      </>
   );
}
