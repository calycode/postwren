import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@mailer/ui';
import { PlainTextPane } from './plain-text-pane';

type PlainTextDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   text: string;
};

export function PlainTextDialog({ open, onOpenChange, text }: PlainTextDialogProps) {
   return (
      <Dialog
         open={open}
         onOpenChange={onOpenChange}
      >
         <DialogContent className="max-w-2xl">
            <DialogHeader>
               <DialogTitle>Plain text</DialogTitle>
               <DialogDescription>The text part sent alongside the HTML email.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
               <PlainTextPane text={text} />
            </div>
         </DialogContent>
      </Dialog>
   );
}
