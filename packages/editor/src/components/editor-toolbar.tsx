import type { BlockType } from '@mailer/email/ir';
import type { RenderWarning } from '@mailer/email/render';
import {
   Badge,
   Button,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuTrigger,
   Separator,
} from '@mailer/ui';
import { FileText, Monitor, Settings2, Smartphone, TriangleAlert } from 'lucide-react';
import type { BlockPattern } from '../lib/patterns';
import type { Viewport } from '../lib/viewport';
import { AddBlockMenu } from './add-block-menu';

type EditorToolbarProps = {
   viewport: Viewport;
   onViewportChange: (viewport: Viewport) => void;
   warnings: readonly RenderWarning[];
   bytes: number;
   onAddBlock: (type: BlockType) => void;
   onAddPattern: (pattern: BlockPattern) => void;
   onOpenDocument: () => void;
   onOpenPlainText: () => void;
};

export function EditorToolbar({
   viewport,
   onViewportChange,
   warnings,
   bytes,
   onAddBlock,
   onAddPattern,
   onOpenDocument,
   onOpenPlainText,
}: EditorToolbarProps) {
   return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/40 px-3 py-2">
         <div className="flex flex-wrap items-center gap-2">
            <AddBlockMenu
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
               Document
            </Button>

            <Button
               size="sm"
               variant="outline"
               className="h-8 px-2 text-xs"
               aria-label="Plain text"
               onClick={onOpenPlainText}
            >
               <FileText aria-hidden="true" />
               Plain text
            </Button>

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
                  Warnings
                  <Badge variant={warnings.length > 0 ? 'warning' : 'secondary'}>
                     {warnings.length}
                  </Badge>
               </DropdownMenuTrigger>
               <DropdownMenuContent className="max-h-80 w-80 overflow-y-auto">
                  {warnings.length === 0 ? (
                     <p className="px-2 py-3 text-sm text-muted-foreground">No warnings.</p>
                  ) : (
                     warnings.map((warning, index) => (
                        <div
                           key={`${warning.code}-${warning.blockId ?? 'document'}-${index}`}
                           className="grid gap-0.5 rounded-md px-2 py-1.5"
                        >
                           <span className="text-xs font-medium capitalize">
                              {warning.code.replace(/_/g, ' ')}
                           </span>
                           <span className="text-xs text-muted-foreground">{warning.message}</span>
                           {warning.blockId && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                 {warning.blockId}
                              </span>
                           )}
                        </div>
                     ))
                  )}
               </DropdownMenuContent>
            </DropdownMenu>

            <Badge variant="secondary">{bytes.toLocaleString()} bytes</Badge>
         </div>
      </div>
   );
}
