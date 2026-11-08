import type { Block, BlockType, Document } from '@postwren/email/ir';
import { createBlock, createDocument } from '@postwren/email/ir';

function make(type: BlockType, patch: Record<string, unknown>): Block {
   return Object.assign(createBlock(type), patch);
}

function document(children: Block[]): Document {
   const base = createDocument();
   return {
      ...base,
      settings: { ...base.settings, linkColor: '#a9711f' },
      children,
   };
}

export type Starter = {
   id: string;
   name: string;
   subject: string;
   description: string;
   build: () => Document;
};

export const STARTERS: readonly Starter[] = [
   {
      id: 'newsletter',
      name: 'Newsletter',
      subject: 'What changed this month',
      description: 'A short intro, three updates and a link to read more.',
      build: () =>
         document([
            make('heading', {
               text: 'A short note from the team',
               level: 1,
               fontSize: 32,
               lineHeight: 40,
            }),
            make('text', {
               text: 'One or two sentences on why this update matters to the reader. Keep it concrete.',
            }),
            make('divider', {}),
            make('heading', { text: 'What changed', level: 2, fontSize: 24, lineHeight: 32 }),
            make('list', {
               items: 'The first change, in one line\nThe second change\nThe third change',
            }),
            make('button', {
               text: 'Read the update',
               href: 'https://example.com',
               backgroundColor: '#00508F',
               textColor: '#FFFFFF',
            }),
            make('text', { text: 'Thanks for reading.\n\nThe Postwren team' }),
         ]),
   },
   {
      id: 'launch',
      name: 'Product launch',
      subject: 'Something new is here',
      description: 'A headline, a short pitch and one clear action.',
      build: () =>
         document([
            make('heading', {
               text: 'Something new is here',
               level: 1,
               fontSize: 34,
               lineHeight: 42,
               align: 'center',
            }),
            make('text', {
               text: 'Say what launched, who it is for and the one problem it solves. Skip the adjectives.',
               align: 'center',
            }),
            make('button', {
               text: 'See what changed',
               href: 'https://example.com',
               align: 'center',
               backgroundColor: '#FFCD82',
               textColor: '#14293A',
            }),
            make('divider', {}),
            make('heading', { text: 'Why it matters', level: 2, fontSize: 22, lineHeight: 30 }),
            make('text', {
               text: 'Replace this paragraph with the detail a reader needs before they click.',
            }),
         ]),
   },
   {
      id: 'welcome',
      name: 'Welcome',
      subject: 'Welcome to the list',
      description: 'Set expectations and point to the first useful thing.',
      build: () =>
         document([
            make('heading', {
               text: 'Welcome to the list',
               level: 1,
               fontSize: 32,
               lineHeight: 40,
            }),
            make('text', {
               text: 'Thanks for signing up. Here is what you will get, and how often.',
            }),
            make('list', {
               ordered: false,
               items: 'One useful email, no more than twice a month\nProduct notes and the occasional long read\nUnsubscribe any time, in one click',
            }),
            make('button', {
               text: 'Start here',
               href: 'https://example.com',
               backgroundColor: '#00508F',
               textColor: '#FFFFFF',
            }),
            make('text', { text: 'Reply to this email if you want to shape what comes next.' }),
         ]),
   },
   {
      id: 'event',
      name: 'Event invite',
      subject: 'You are invited',
      description: 'Who, what, when and a single RSVP button.',
      build: () =>
         document([
            make('heading', { text: "You're invited", level: 1, fontSize: 34, lineHeight: 42 }),
            make('text', {
               text: 'Add the date, time and place here. One paragraph is enough.',
            }),
            make('columns', {
               columns: [
                  {
                     widthPercent: 50,
                     blocks: [
                        make('heading', { text: 'When', level: 3, fontSize: 16, lineHeight: 22 }),
                        make('text', { text: 'Add the date and time.' }),
                     ],
                  },
                  {
                     widthPercent: 50,
                     blocks: [
                        make('heading', { text: 'Where', level: 3, fontSize: 16, lineHeight: 22 }),
                        make('text', { text: 'Add the venue or link.' }),
                     ],
                  },
               ],
            }),
            make('button', {
               text: 'RSVP',
               href: 'https://example.com',
               backgroundColor: '#00508F',
               textColor: '#FFFFFF',
            }),
         ]),
   },
   {
      id: 'plain',
      name: 'Plain update',
      subject: 'A quick update',
      description: 'Text only. Fast to write, easy to read.',
      build: () =>
         document([
            make('text', { text: 'Hi there,' }),
            make('text', {
               text: 'Write the update as you would in a normal email. Short paragraphs, no decoration.',
            }),
            make('text', { text: 'That is it for this one.\n\nThanks,\nThe team' }),
         ]),
   },
];
