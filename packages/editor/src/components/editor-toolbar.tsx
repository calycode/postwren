import type { RenderWarning } from '@postwren/email/render';
import {
   Badge,
   Button,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
   Separator,
   cn,
} from '@postwren/ui';
import {
   Maximize2,
   Minimize2,
   Monitor,
   PanelLeftClose,
   PanelLeftOpen,
   Redo2,
   Settings2,
   Smartphone,
   TriangleAlert,
   Undo2,
} from 'lucide-react';
import { GMAIL_CLIP_BYTES } from '@postwren/email/render';
import type { Viewport } from '../lib/viewport';

type EditorToolbarProps = {
   viewport: Viewport;
   onViewportChange: (viewport: Viewport) => void;
   warnings: readonly RenderWarning[];
   /** Structural problems that pause autosave. */
   issues: readonly string[];
   bytes: number;
   canUndo: boolean;
   canRedo: boolean;
   libraryOpen: boolean;
   onToggleLibrary: () => void;
   focusMode: boolean;
   onToggleFocus: () => void;
   zoom: number;
   onZoomChange: (zoom: number) => void;
   onUndo: () => void;
   onRedo: () => void;
   onOpenDocument: () => void;
   onSelectBlock?: (id: string) => void;
};

const CLIP_KILOBYTES = Math.round(GMAIL_CLIP_BYTES / 1000);

function warningTitle(message: string): string {
   const sentence = /^(.+?[.!?])(?:\s|$)/.exec(message);
   return sentence?.[1] ?? message;
}

export function EditorToolbar({
   viewport,
   onViewportChange,
   warnings,
   issues,
   bytes,
   canUndo,
   canRedo,
   libraryOpen,
   onToggleLibrary,
   focusMode,
   onToggleFocus,
   zoom,
   onZoomChange,
   onUndo,
   onRedo,
   onOpenDocument,
   onSelectBlock,
}: EditorToolbarProps) {
   const aboveClip = bytes > GMAIL_CLIP_BYTES;
   const needsAttention = issues.length > 0;
   const summary = needsAttention
      ? (issues[0] ?? 'This document needs attention before it can be saved')
      : warnings.length > 0
        ? warningTitle(warnings[0]?.message ?? '')
        : 'No warnings';

   return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card/40 px-3 py-2">
         <div className="flex flex-wrap items-center gap-2">
            {!focusMode && (
               <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={libraryOpen ? 'Hide blocks panel' : 'Show blocks panel'}
                  aria-pressed={libraryOpen}
                  title={libraryOpen ? 'Hide blocks panel' : 'Show blocks panel'}
                  onClick={onToggleLibrary}
               >
                  {libraryOpen ? (
                     <PanelLeftClose aria-hidden="true" />
                  ) : (
                     <PanelLeftOpen aria-hidden="true" />
                  )}
               </Button>
            )}

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

            <DropdownMenu>
               <DropdownMenuTrigger
                  aria-label={`Zoom ${Math.round(zoom * 100)} percent`}
                  title="Canvas zoom"
                  className="h-8 px-2 text-xs"
               >
                  {Math.round(zoom * 100)}%
               </DropdownMenuTrigger>
               <DropdownMenuContent>
                  {[1, 0.75, 0.5].map((value) => (
                     <DropdownMenuItem
                        key={value}
                        aria-pressed={zoom === value}
                        onSelect={() => onZoomChange(value)}
                     >
                        {value * 100}%
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>

         <div className="flex items-center gap-2">
            <Button
               size="icon"
               variant="ghost"
               className="size-8"
               aria-label={focusMode ? 'Exit focus mode' : 'Focus on the email'}
               aria-pressed={focusMode}
               title={focusMode ? 'Exit focus mode' : 'Focus on the email'}
               onClick={onToggleFocus}
            >
               {focusMode ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </Button>

            <DropdownMenu>
               <DropdownMenuTrigger
                  aria-label={
                     needsAttention
                        ? `${issues.length} document issues need attention`
                        : 'Render warnings'
                  }
                  title={summary}
                  className={cn(
                     'gap-2 px-2 py-1 text-xs',
                     needsAttention &&
                        'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15',
                  )}
               >
                  <TriangleAlert aria-hidden="true" />
                  <span className="hidden sm:inline">
                     {needsAttention ? 'Needs attention' : 'Warnings'}
                  </span>
                  <Badge
                     variant={
                        needsAttention
                           ? 'destructive'
                           : warnings.length > 0
                             ? 'warning'
                             : 'secondary'
                     }
                  >
                     {needsAttention ? issues.length : warnings.length}
                  </Badge>
               </DropdownMenuTrigger>
               <DropdownMenuContent className="max-h-80 w-80 overflow-y-auto">
                  {needsAttention && (
                     <div className="grid gap-1 px-2 py-2">
                        <p className="text-xs font-semibold text-destructive">
                           This document needs attention before it can be saved
                        </p>
                        <ul className="grid gap-1 pl-4 text-xs text-muted-foreground">
                           {issues.map((issue) => (
                              <li
                                 key={issue}
                                 className="list-disc"
                              >
                                 {issue}
                              </li>
                           ))}
                        </ul>
                     </div>
                  )}

                  {needsAttention && warnings.length > 0 && <Separator className="my-1" />}

                  {warnings.length === 0 ? (
                     needsAttention ? null : (
                        <p className="px-2 py-3 text-sm text-muted-foreground">No warnings.</p>
                     )
                  ) : (
                     warnings.map((warning, index) => {
                        const title = warningTitle(warning.message);
                        const blockId = warning.blockId;

                        if (blockId === undefined || onSelectBlock === undefined) {
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
