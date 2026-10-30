import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   Tabs,
   TabsContent,
   TabsList,
   TabsTrigger,
} from '@postwren/ui';

export type EmailPreviewDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   name: string;
   html: string;
   text: string;
};

export function EmailPreviewDialog({
   open,
   onOpenChange,
   name,
   html,
   text,
}: EmailPreviewDialogProps) {
   return (
      <Dialog
         open={open}
         onOpenChange={onOpenChange}
      >
         <DialogContent className="max-w-5xl">
            <DialogHeader>
               <DialogTitle>Preview: {name}</DialogTitle>
            </DialogHeader>

            <Tabs
               defaultValue="html"
               className="gap-2"
            >
               <TabsList>
                  <TabsTrigger value="html">Rendered</TabsTrigger>
                  <TabsTrigger value="text">Plain text</TabsTrigger>
               </TabsList>

               <TabsContent value="html">
                  <iframe
                     title="Rendered email preview"
                     srcDoc={html}
                     sandbox=""
                     className="h-[65dvh] w-full rounded-lg border border-border bg-white"
                  />
               </TabsContent>

               <TabsContent value="text">
                  <pre className="h-[65dvh] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
                     {text}
                  </pre>
               </TabsContent>
            </Tabs>
         </DialogContent>
      </Dialog>
   );
}
