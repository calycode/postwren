import type { Block, ColumnsBlock, HeadingBlock, TextBlock } from '@postwren/email/ir';
import {
   createAvatarBlock,
   createHeadingBlock,
   createImageBlock,
   createLinkBlock,
   createListBlock,
   createQuoteBlock,
   createTextBlock,
} from '@postwren/email/ir';

export type BlockPattern = {
   id: string;
   label: string;
   description: string;
   build: () => Block[];
};

const tightPadding = { top: 0, right: 0, bottom: 0, left: 0 };

function bigStat(value: string): HeadingBlock {
   return {
      ...createHeadingBlock(),
      text: value,
      fontSize: 32,
      lineHeight: 40,
      padding: tightPadding,
   };
}

function statCaption(label: string): TextBlock {
   return {
      ...createTextBlock(label),
      fontSize: 13,
      lineHeight: 20,
      padding: { top: 4, right: 0, bottom: 0, left: 0 },
   };
}

function statsBlock(): ColumnsBlock {
   return {
      id: `columns-${crypto.randomUUID()}`,
      type: 'columns',
      columns: [
         { widthPercent: 33, blocks: [bigStat('12k'), statCaption('Monthly readers')] },
         { widthPercent: 34, blocks: [bigStat('98%'), statCaption('Delivery rate')] },
         { widthPercent: 33, blocks: [bigStat('4.9'), statCaption('Average rating')] },
      ],
      padding: { top: 8, right: 24, bottom: 16, left: 24 },
   };
}

export const BLOCK_PATTERNS: readonly BlockPattern[] = [
   {
      id: 'feature',
      label: 'Feature',
      description: 'A heading, a paragraph and three bullets.',
      build: () => {
         const heading = createHeadingBlock();
         heading.text = 'A feature worth trying';
         heading.level = 2;
         heading.fontSize = 26;
         heading.lineHeight = 34;

         const text = createTextBlock(
            'Explain the feature in a sentence or two, then list what changes for the reader.',
         );

         const list = createListBlock();
         list.items = 'Works out of the box\nNo setup required\nFits your existing workflow';

         return [heading, text, list];
      },
   },
   {
      id: 'stats',
      label: 'Stats',
      description: 'Three columns of numbers with captions.',
      build: () => [statsBlock()],
   },
   {
      id: 'testimonial',
      label: 'Testimonial',
      description: 'A quote with an avatar and attribution.',
      build: () => {
         const quote = createQuoteBlock();
         quote.text = 'This changed the way our team sends every update.';
         quote.attribution = 'Ada Lovelace';

         const avatar = createAvatarBlock();
         avatar.size = 56;
         avatar.name = 'Ada Lovelace';
         avatar.caption = 'Head of Marketing';

         return [quote, avatar];
      },
   },
   {
      id: 'article',
      label: 'Article',
      description: 'An image, a heading, a paragraph and a read-more link.',
      build: () => {
         const image = createImageBlock();
         image.alt = 'Article cover';
         image.width = 552;

         const heading = createHeadingBlock();
         heading.text = 'Read the full story';
         heading.level = 2;
         heading.fontSize = 26;
         heading.lineHeight = 34;

         const text = createTextBlock(
            'A short summary of the article so readers know what they will find inside.',
         );

         const link = createLinkBlock();
         link.text = 'Continue reading';
         link.href = 'https://example.com/article';

         return [image, heading, text, link];
      },
   },
];
