import type { BlockType, Document } from '@postwren/email/ir';
import { GMAIL_CLIP_BYTES } from '@postwren/email/render';
import type { RenderWarning } from '@postwren/email/render';
import {
   Badge,
   Button,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
   Separator,
} from '@postwren/ui';
import { Monitor, Redo2, Settings2, Smartphone, TriangleAlert, Undo2 } from 'lucide-react';
import { blockLabel, findBlock } from '../lib/document-ops';
import type { BlockPattern } from '../lib/patterns';
import type { Viewport } from '../lib/viewport';
import { AddBlockMenu } from './add-block-menu';
import { BlockOutline } from './block-outline';

type EditorToolbarProps = {
   doc: Document;
   selectedId: string | null;
   viewport: Viewport;
   onViewportChange: (viewport: Viewport) => void;
   warnings: readonly RenderWarning[];
   bytes: number;
   canUndo: boolean;
   canRedo: boolean;
   onUndo: () => void;
   onRedo: () => void;
   onAddBlock: (type: BlockType) => void;
   onAddPattern: (pattern: BlockPattern) => void;
   onSelectBlock: (id: string) => void;
   onOpenDocument: () => void;
};

const CLIP_KILOBYTES = Math.round(GMAIL_CLIP_BYTES / 1000);

function warningTitle(message: string): string {
   const sentence = /^(.+?[.!?])(?:\s|$)/.exec(message);
   return sentence?.[1] ?? message;
}

export function EditorToolbar({
   doc,
   selectedId,
   viewport,
   onViewportChange,
   warnings,
   bytes,
   canUndo,
   canRedo,
   onUndo,
   onRedo,
   onAddBlock,
   onAddPattern,
   onSelectBlock,
   onOpenDocument,
}: EditorToolbarProps) {
   const selectedBlock = selectedId !== null ? findBlock(doc, selectedId) : null;
   const selectedLabel = selectedBlock !== null ? blockLabel(selectedBlock) : null;
   const aboveClip = bytes > GMAIL_CLIP_BYTES;

   return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card/40 px-3 py-2">
         <div className="flex flex-wrap items-center gap-2">
            <BlockOutline
               doc={doc}
               selectedId={selectedId}
               onSelect={onSelectBlock}
            />

            <AddBlockMenu
               afterLabel={selectedLabel}
               onAdd={onAddBlock}
               onAddPattern={onAddPattern}
            />

            <Button
               size="sm"
               variant="outline"
               className="h-8 px-2 text-xs"
               aria-label="Document settings"
               onClick={onOpenDocument}
            >
               <Settings2 aria-hidden="true" />
               <span className="hidden sm:inline">Document</span>
            </Button>

            <div
               role="group"
               aria-label="Edit history"
               className="flex items-center gap-0.5"
            >
               <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Undo"
                  title="Undo (Ctrl/Cmd+Z)"
                  disabled={!canUndo}
                  onClick={onUndo}
               >
                  <Undo2 aria-hidden="true" />
               </Button>
               <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Redo"
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                  disabled={!canRedo}
                  onClick={onRedo}
               >
                  <Redo2 aria-hidden="true" />
               </Button>
            </div>

            <Separator
               orientation="vertical"
               className="hidden h-6 sm:block"
            />

            <div
               role="group"
               aria-label="Preview width"
               className="flex items-center rounded-md border border-border bg-background p-0.5"
            >
               <Button
                  size="sm"
                  variant={viewport === 'desktop' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  aria-pressed={viewport === 'desktop'}
                  aria-label="600 pixel desktop preview"
                  title="Desktop 600px"
                  onClick={() => onViewportChange('desktop')}
               >
                  <Monitor aria-hidden="true" />
                  600
               </Button>
               <Button
                  size="sm"
                  variant={viewport === 'mobile' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  aria-pressed={viewport === 'mobile'}
                  aria-label="375 pixel mobile preview"
                  title="Mobile 375px"
                  onClick={() => onViewportChange('mobile')}
               >
                  <Smartphone aria-hidden="true" />
                  375
               </Button>
            </div>
         </div>

         <div className="flex items-center gap-2">
            <DropdownMenu>
               <DropdownMenuTrigger
                  aria-label="Render warnings"
                  className="gap-2 px-2 py-1 text-xs"
               >
                  <TriangleAlert aria-hidden="true" />
                  <span className="hidden sm:inline">Warnings</span>
                  <Badge variant={warnings.length > 0 ? 'warning' : 'secondary'}>
                     {warnings.length}
                  </Badge>
               </DropdownMenuTrigger>
               <DropdownMenuContent className="max-h-80 w-80 overflow-y-auto">
                  {warnings.length === 0 ? (
                     <p className="px-2 py-3 text-sm text-muted-foreground">No warnings.</p>
                  ) : (
                     warnings.map((warning, index) => {
                        const title = warningTitle(warning.message);
                        const blockId = warning.blockId;

                        if (blockId === undefined) {
                           return (
                              <div
                                 key={`${warning.code}-document-${index}`}
                                 className="grid gap-0.5 rounded-md px-2 py-1.5"
                              >
                                 <span className="text-xs font-medium">{title}</span>
                                 <span className="font-mono text-[10px] text-muted-foreground">
                                    {warning.code}
                                 </span>
                              </div>
                           );
                        }

                        return (
                           <DropdownMenuItem
                              key={`${warning.code}-${blockId}-${index}`}
                              onSelect={() => onSelectBlock(blockId)}
                              className="grid w-full gap-0.5 px-2 py-1.5 text-left"
                           >
                              <span className="text-xs font-medium">{title}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                 {warning.code}
                              </span>
                           </DropdownMenuItem>
                        );
                     })
                  )}
               </DropdownMenuContent>
            </DropdownMenu>

            <Badge
               variant={aboveClip ? 'warning' : 'outline'}
               title={
                  aboveClip
                     ? `Above the ${CLIP_KILOBYTES} KB Gmail clip`
                     : `Under the ${CLIP_KILOBYTES} KB Gmail clip`
               }
            >
               {bytes.toLocaleString()} bytes
            </Badge>
         </div>
      </div>
   );
}
