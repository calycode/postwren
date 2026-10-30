import type { Document, DocumentSettings } from '@postwren/email/ir';
import {
   Badge,
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   Field,
   Textarea,
} from '@postwren/ui';
import { FONT_FAMILY_OPTIONS } from '../lib/block-schema';
import { updateSettings } from '../lib/document-ops';
import { HexInput, OptionSelect } from './field-controls';

type DocumentDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   doc: Document;
   onChange: (next: Document) => void;
};

export function DocumentDialog({ open, onOpenChange, doc, onChange }: DocumentDialogProps) {
   const settings = doc.settings;
   const update = (patch: Partial<DocumentSettings>) => onChange(updateSettings(doc, patch));

   return (
      <Dialog
         open={open}
         onOpenChange={onOpenChange}
      >
         <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
               <DialogTitle>Document</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4">
               <Field
                  label="Preheader"
                  htmlFor="doc-preheader"
                  hint={`${doc.preheader?.length ?? 0}/200`}
               >
                  <Textarea
                     id="doc-preheader"
                     rows={2}
                     maxLength={200}
                     value={doc.preheader ?? ''}
                     placeholder="Preview text shown in the inbox"
                     onInput={(event) => onChange({ ...doc, preheader: event.currentTarget.value })}
                  />
               </Field>

               <Field
                  label="Background colour"
                  htmlFor="doc-background"
               >
                  <HexInput
                     id="doc-background"
                     value={settings.backgroundColor}
                     fallback="#f4f4f5"
                     ariaLabel="Background colour"
                     onValueChange={(next) => update({ backgroundColor: next })}
                  />
               </Field>

               <Field
                  label="Content colour"
                  htmlFor="doc-content"
               >
                  <HexInput
                     id="doc-content"
                     value={settings.contentColor}
                     fallback="#ffffff"
                     ariaLabel="Content colour"
                     onValueChange={(next) => update({ contentColor: next })}
                  />
               </Field>

               <Field
                  label="Text colour"
                  htmlFor="doc-text"
               >
                  <HexInput
                     id="doc-text"
                     value={settings.textColor}
                     fallback="#18181b"
                     ariaLabel="Text colour"
                     onValueChange={(next) => update({ textColor: next })}
                  />
               </Field>

               <Field
                  label="Link colour"
                  htmlFor="doc-link"
               >
                  <HexInput
                     id="doc-link"
                     value={settings.linkColor}
                     fallback="#0f766e"
                     ariaLabel="Link colour"
                     onValueChange={(next) => update({ linkColor: next })}
                  />
               </Field>

               <Field
                  label="Font family"
                  htmlFor="doc-font"
               >
                  <OptionSelect
                     id="doc-font"
                     value={settings.fontFamily}
                     options={FONT_FAMILY_OPTIONS}
                     ariaLabel="Font family"
                     onValueChange={(next) =>
                        update({ fontFamily: next as DocumentSettings['fontFamily'] })
                     }
                  />
               </Field>

               <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-xs text-muted-foreground">Content width</span>
                  <Badge variant="secondary">{settings.width}px</Badge>
               </div>

               <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Every send appends the unsubscribe footer automatically.
               </p>
            </div>
         </DialogContent>
      </Dialog>
   );
}
