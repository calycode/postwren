import type { BlockType } from '@mailer/email/ir';
import {
   Code,
   Columns2,
   Heading1,
   Image as ImageIcon,
   Link as LinkIcon,
   List,
   MousePointerClick,
   Quote,
   RectangleHorizontal,
   SeparatorHorizontal,
   Share2,
   Type,
} from 'lucide-react';

export function BlockIcon({ type, className }: { type: BlockType; className?: string }) {
   switch (type) {
      case 'heading':
         return (
            <Heading1
               className={className}
               aria-hidden="true"
            />
         );
      case 'text':
         return (
            <Type
               className={className}
               aria-hidden="true"
            />
         );
      case 'button':
         return (
            <MousePointerClick
               className={className}
               aria-hidden="true"
            />
         );
      case 'image':
         return (
            <ImageIcon
               className={className}
               aria-hidden="true"
            />
         );
      case 'divider':
         return (
            <SeparatorHorizontal
               className={className}
               aria-hidden="true"
            />
         );
      case 'spacer':
         return (
            <RectangleHorizontal
               className={className}
               aria-hidden="true"
            />
         );
      case 'columns':
         return (
            <Columns2
               className={className}
               aria-hidden="true"
            />
         );
      case 'social':
         return (
            <Share2
               className={className}
               aria-hidden="true"
            />
         );
      case 'list':
         return (
            <List
               className={className}
               aria-hidden="true"
            />
         );
      case 'quote':
         return (
            <Quote
               className={className}
               aria-hidden="true"
            />
         );
      case 'code':
         return (
            <Code
               className={className}
               aria-hidden="true"
            />
         );
      case 'link':
         return (
            <LinkIcon
               className={className}
               aria-hidden="true"
            />
         );
   }
}
