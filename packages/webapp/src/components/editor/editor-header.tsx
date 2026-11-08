import { BookmarkPlus, Copy, Eye, History, Save, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Label, cn } from '@postwren/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';

export type EditorHeaderProps = {
   name: string;
   subject: string;
   revision: number;
   statusLabel: string;
   statusError: boolean;
   saving: boolean;
   fieldsDisabled: boolean;
   saveDisabled: boolean;
   duplicateBusy: boolean;
   deleteBusy: boolean;
   previewDisabled: boolean;
   onNameChange: (value: string) => void;
   onSubjectChange: (value: string) => void;
   onSave: () => void;
   onDuplicate: () => void;
   onSaveAsTemplate: () => void;
   onPreview: () => void;
   onHistory: () => void;
   onDelete: () => void;
};

export function EditorHeader({
   name,
   subject,
   revision,
   statusLabel,
   statusError,
   saving,
   fieldsDisabled,
   saveDisabled,
   duplicateBusy,
   deleteBusy,
   previewDisabled,
   onNameChange,
   onSubjectChange,
   onSave,
   onDuplicate,
   onSaveAsTemplate,
   onPreview,
   onHistory,
   onDelete,
}: EditorHeaderProps) {
   return (
      <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
         <Breadcrumbs
            items={[
               { label: 'Templates', href: '/templates' },
               { label: name.trim().length > 0 ? name : 'Untitled template' },
            ]}
            className="px-1"
         />

         <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-24 flex-1 items-center gap-2">
               <label
                  htmlFor="template-name"
                  className="sr-only"
               >
                  Template name
               </label>
               <Input
                  id="template-name"
                  value={name}
                  disabled={fieldsDisabled}
                  className="h-8 min-w-0 flex-1 max-w-sm border-transparent bg-transparent px-2 font-heading text-base font-semibold shadow-none focus-visible:border-input"
                  onInput={(event) => onNameChange(event.currentTarget.value)}
               />
               <Badge
                  variant="secondary"
                  className="shrink-0"
               >
                  v{revision}
               </Badge>
            </div>

            <span
               role="status"
               aria-live="polite"
               className={cn(
                  'shrink-0 text-xs font-medium',
                  statusError ? 'text-destructive' : 'text-muted-foreground',
               )}
            >
               {statusLabel}
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
               <Button
                  size="sm"
                  variant="outline"
                  disabled={fieldsDisabled}
                  onClick={onHistory}
               >
                  <History aria-hidden="true" />
                  History
               </Button>
               <Button
                  size="sm"
                  disabled={saveDisabled}
                  aria-busy={saving}
                  onClick={onSave}
               >
                  <Save aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save'}
               </Button>
               <Button
                  size="sm"
                  variant="outline"
                  disabled={duplicateBusy}
                  onClick={onDuplicate}
               >
                  <Copy aria-hidden="true" />
                  {duplicateBusy ? 'Duplicating…' : 'Duplicate'}
               </Button>
               <Button
                  size="sm"
                  variant="outline"
                  disabled={fieldsDisabled}
                  onClick={onSaveAsTemplate}
               >
                  <BookmarkPlus aria-hidden="true" />
                  Save as template
               </Button>
               <Button
                  size="sm"
                  variant="outline"
                  disabled={previewDisabled}
                  onClick={onPreview}
               >
                  <Eye aria-hidden="true" />
                  Preview
               </Button>
               <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={deleteBusy}
                  onClick={onDelete}
               >
                  <Trash2 aria-hidden="true" />
                  {deleteBusy ? 'Deleting…' : 'Delete'}
               </Button>
            </div>
         </div>

         <div className="flex flex-wrap items-center gap-2">
            <Label
               htmlFor="template-subject"
               className="w-16 shrink-0 text-xs font-medium text-muted-foreground"
            >
               Subject
            </Label>
            <Input
               id="template-subject"
               value={subject}
               disabled={fieldsDisabled}
               className="h-8 min-w-0 flex-1"
               onInput={(event) => onSubjectChange(event.currentTarget.value)}
            />
         </div>
      </div>
   );
}
