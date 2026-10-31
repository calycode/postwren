import type { Block, ColumnsBlock, HeadingBlock, TextBlock } from '@postwren/email/ir';
import {
   createAvatarBlock,
   createButtonBlock,
   createColumnsBlock,
   createDividerBlock,
   createHeadingBlock,
   createImageBlock,
   createLinkBlock,
   createListBlock,
   createQuoteBlock,
   createSocialBlock,
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
   {
      id: 'header',
      label: 'Header',
      description: 'A logo, a navigation line and a divider.',
      build: () => {
         const logo = createImageBlock();
         logo.src = 'https://example.com/logo.png';
         logo.alt = 'Your logo';
         logo.width = 140;
         logo.align = 'left';
         logo.padding = { top: 24, right: 24, bottom: 8, left: 24 };

         const nav = createTextBlock(
            '[About](https://example.com/about) · [Blog](https://example.com/blog) · [Company](https://example.com/company)',
         );
         nav.fontSize = 14;
         nav.lineHeight = 20;
         nav.padding = { top: 0, right: 24, bottom: 16, left: 24 };

         const divider = createDividerBlock();
         divider.padding = { top: 0, right: 24, bottom: 24, left: 24 };

         return [logo, nav, divider];
      },
   },
   {
      id: 'footer',
      label: 'Footer',
      description: 'Brand, address, social links and an unsubscribe link.',
      build: () => {
         const divider = createDividerBlock();
         divider.padding = { top: 24, right: 24, bottom: 16, left: 24 };

         const brand = createTextBlock('**Postwren**');
         brand.align = 'center';
         brand.padding = { top: 0, right: 24, bottom: 4, left: 24 };

         const address = createTextBlock('123 Main Street, Anytown · hello@example.com');
         address.align = 'center';
         address.fontSize = 13;
         address.lineHeight = 20;
         address.padding = { top: 0, right: 24, bottom: 16, left: 24 };

         const social = createSocialBlock();
         social.align = 'center';
         social.links = [
            { network: 'x', href: 'https://x.com/example' },
            { network: 'linkedin', href: 'https://linkedin.com/company/example' },
            { network: 'instagram', href: 'https://instagram.com/example' },
         ];
         social.padding = { top: 0, right: 24, bottom: 8, left: 24 };

         const unsubscribe = createLinkBlock();
         unsubscribe.text = 'Unsubscribe';
         unsubscribe.href = '{{ links.unsubscribe }}';
         unsubscribe.align = 'center';
         unsubscribe.fontSize = 12;
         unsubscribe.lineHeight = 18;
         unsubscribe.color = '#71717a';
         unsubscribe.padding = { top: 0, right: 24, bottom: 24, left: 24 };

         return [divider, brand, address, social, unsubscribe];
      },
   },
   {
      id: 'pricing',
      label: 'Pricing',
      description: 'Three tiers, each with a price, features and a button.',
      build: () => {
         const tiers = [
            {
               name: 'Starter',
               price: '$9',
               features: '1 seat\n1,000 emails\nBasic analytics',
               cta: 'Start free',
            },
            {
               name: 'Pro',
               price: '$29',
               features: '5 seats\n10,000 emails\nAdvanced analytics',
               cta: 'Choose Pro',
            },
            {
               name: 'Team',
               price: '$79',
               features: '20 seats\n50,000 emails\nPriority support',
               cta: 'Choose Team',
            },
         ] as const;
         const widths = [33, 34, 33] as const;

         const columns = createColumnsBlock();
         columns.columns = tiers.map((tier, index) => {
            const name = createHeadingBlock();
            name.text = tier.name;
            name.level = 2;
            name.fontSize = 18;
            name.lineHeight = 26;
            name.align = 'center';
            name.padding = tightPadding;

            const price = createTextBlock(`**${tier.price}** / month`);
            price.align = 'center';
            price.fontSize = 28;
            price.lineHeight = 36;
            price.padding = { top: 0, right: 0, bottom: 12, left: 0 };

            const features = createListBlock();
            features.items = tier.features;
            features.fontSize = 14;
            features.lineHeight = 22;
            features.gap = 4;
            features.padding = { top: 0, right: 0, bottom: 16, left: 0 };

            const cta = createButtonBlock();
            cta.text = tier.cta;
            cta.href = `https://example.com/pricing/${tier.name.toLowerCase()}`;
            cta.align = 'center';
            cta.fontSize = 14;
            cta.innerPaddingX = 16;
            cta.innerPaddingY = 10;
            cta.padding = tightPadding;

            return {
               widthPercent: widths[index] ?? 33,
               blocks: [name, price, features, cta],
            };
         });
         columns.padding = { top: 0, right: 24, bottom: 24, left: 24 };

         return [columns];
      },
   },
   {
      id: 'product',
      label: 'Product',
      description: 'A product photo, name, price and buy button.',
      build: () => {
         const image = createImageBlock();
         image.src = 'https://example.com/product.png';
         image.alt = 'Product photo';
         image.width = 552;

         const name = createHeadingBlock();
         name.text = 'Product name';
         name.level = 2;
         name.fontSize = 24;
         name.lineHeight = 32;

         const price = createTextBlock('**$49** · Free shipping');
         price.fontSize = 18;
         price.lineHeight = 26;

         const description = createTextBlock(
            'One or two sentences about what the product does and why it is worth buying.',
         );

         const button = createButtonBlock();
         button.text = 'Buy now';
         button.href = 'https://example.com/product';

         return [image, name, price, description, button];
      },
   },
   {
      id: 'rating',
      label: 'Rating',
      description: 'A five star prompt with rating links.',
      build: () => {
         const heading = createHeadingBlock();
         heading.text = 'How did we do?';
         heading.level = 2;
         heading.fontSize = 24;
         heading.lineHeight = 32;
         heading.align = 'center';

         const stars = createTextBlock('★★★★★');
         stars.align = 'center';
         stars.fontSize = 28;
         stars.lineHeight = 36;
         stars.color = '#b45309';

         const choices = createTextBlock(
            '[1](https://example.com/rate/1) · [2](https://example.com/rate/2) · [3](https://example.com/rate/3) · [4](https://example.com/rate/4) · [5](https://example.com/rate/5)',
         );
         choices.align = 'center';
         choices.fontSize = 14;
         choices.lineHeight = 20;

         const caption = createTextBlock('Your feedback helps us improve.');
         caption.align = 'center';
         caption.fontSize = 13;
         caption.lineHeight = 20;

         return [heading, stars, choices, caption];
      },
   },
   {
      id: 'bento',
      label: 'Bento',
      description: 'A two column marketing grid of short features.',
      build: () => {
         const heading = createHeadingBlock();
         heading.text = 'What is new';
         heading.level = 2;
         heading.fontSize = 26;
         heading.lineHeight = 34;

         const columns = createColumnsBlock();
         columns.columns = [
            {
               widthPercent: 50,
               blocks: [
                  {
                     ...createHeadingBlock(),
                     text: 'Faster sends',
                     level: 3,
                     fontSize: 18,
                     lineHeight: 26,
                     padding: tightPadding,
                  },
                  {
                     ...createTextBlock('Queue less and reach inboxes sooner.'),
                     fontSize: 14,
                     lineHeight: 22,
                     padding: tightPadding,
                  },
               ],
            },
            {
               widthPercent: 50,
               blocks: [
                  {
                     ...createHeadingBlock(),
                     text: 'Better analytics',
                     level: 3,
                     fontSize: 18,
                     lineHeight: 26,
                     padding: tightPadding,
                  },
                  {
                     ...createTextBlock('See opens, clicks and bounces at a glance.'),
                     fontSize: 14,
                     lineHeight: 22,
                     padding: tightPadding,
                  },
               ],
            },
         ];
         columns.padding = { top: 0, right: 24, bottom: 24, left: 24 };

         return [heading, columns];
      },
   },
];
