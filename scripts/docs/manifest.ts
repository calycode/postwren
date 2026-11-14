export type DocEntry = {
   section: string;
   /** URL path under /docs/. The overview uses an empty path. */
   path: string;
   /** Fallback title; the generator prefers the first markdown heading. */
   title: string;
   /** Markdown file relative to docs/. */
   file: string;
   order: number;
   /** Sidebar nesting. The current site is flat, but the field keeps the door open. */
   segments: string[];
};

export type DocLink = {
   section: string;
   title: string;
   href: string;
};

export const DOC_ENTRIES: DocEntry[] = [
   {
      section: 'Overview',
      path: '',
      title: 'Postwren documentation',
      file: 'README.md',
      order: 0,
      segments: [],
   },

   // User guide
   {
      section: 'User guide',
      path: 'user/',
      title: 'User guide',
      file: 'user/README.md',
      order: 10,
      segments: ['user'],
   },
   {
      section: 'User guide',
      path: 'user/getting-started',
      title: 'Getting started',
      file: 'user/getting-started.md',
      order: 11,
      segments: ['user', 'getting-started'],
   },
   {
      section: 'User guide',
      path: 'user/subscribers',
      title: 'Subscribers and tags',
      file: 'user/subscribers.md',
      order: 12,
      segments: ['user', 'subscribers'],
   },
   {
      section: 'User guide',
      path: 'user/templates',
      title: 'Templates and the editor',
      file: 'user/templates.md',
      order: 13,
      segments: ['user', 'templates'],
   },
   {
      section: 'User guide',
      path: 'user/campaigns',
      title: 'Campaigns',
      file: 'user/campaigns.md',
      order: 14,
      segments: ['user', 'campaigns'],
   },
   {
      section: 'User guide',
      path: 'user/automations',
      title: 'Automations',
      file: 'user/automations.md',
      order: 15,
      segments: ['user', 'automations'],
   },
   {
      section: 'User guide',
      path: 'user/settings',
      title: 'Settings',
      file: 'user/settings.md',
      order: 16,
      segments: ['user', 'settings'],
   },
   {
      section: 'User guide',
      path: 'user/integrations',
      title: 'Integrations',
      file: 'user/integrations.md',
      order: 17,
      segments: ['user', 'integrations'],
   },
   {
      section: 'User guide',
      path: 'user/faq',
      title: 'FAQ',
      file: 'user/faq.md',
      order: 18,
      segments: ['user', 'faq'],
   },

   // Developer guide
   {
      section: 'Developer guide',
      path: 'developer/',
      title: 'Developer guide',
      file: 'developer/README.md',
      order: 30,
      segments: ['developer'],
   },
   {
      section: 'Developer guide',
      path: 'developer/self-hosting',
      title: 'Self-hosting',
      file: 'developer/self-hosting.md',
      order: 31,
      segments: ['developer', 'self-hosting'],
   },
   {
      section: 'Developer guide',
      path: 'developer/architecture',
      title: 'Architecture',
      file: 'developer/architecture.md',
      order: 32,
      segments: ['developer', 'architecture'],
   },
   {
      section: 'Developer guide',
      path: 'developer/configuration',
      title: 'Configuration',
      file: 'developer/configuration.md',
      order: 33,
      segments: ['developer', 'configuration'],
   },
   {
      section: 'Developer guide',
      path: 'developer/public-subscribe',
      title: 'Public subscribe endpoint',
      file: 'developer/public-subscribe.md',
      order: 34,
      segments: ['developer', 'public-subscribe'],
   },
   {
      section: 'Developer guide',
      path: 'developer/webhooks',
      title: 'Webhooks',
      file: 'developer/webhooks.md',
      order: 35,
      segments: ['developer', 'webhooks'],
   },
   {
      section: 'Developer guide',
      path: 'developer/email-events',
      title: 'Bounces and complaints',
      file: 'developer/email-events.md',
      order: 36,
      segments: ['developer', 'email-events'],
   },
   {
      section: 'Developer guide',
      path: 'developer/agent-access',
      title: 'Agent access, API keys and MCP',
      file: 'developer/agent-access.md',
      order: 37,
      segments: ['developer', 'agent-access'],
   },
   {
      section: 'Developer guide',
      path: 'developer/iframe-embedding',
      title: 'Iframe embedding',
      file: 'developer/iframe-embedding.md',
      order: 38,
      segments: ['developer', 'iframe-embedding'],
   },
   {
      section: 'Developer guide',
      path: 'developer/emdash-plugin',
      title: 'EmDash plugin',
      file: 'developer/emdash-plugin.md',
      order: 39,
      segments: ['developer', 'emdash-plugin'],
   },
   {
      section: 'Developer guide',
      path: 'developer/appflare',
      title: 'Deploy with Appflare',
      file: 'developer/appflare.md',
      order: 40,
      segments: ['developer', 'appflare'],
   },
   {
      section: 'Developer guide',
      path: 'developer/automation-spec',
      title: 'Automation module spec',
      file: 'developer/automation-spec.md',
      order: 41,
      segments: ['developer', 'automation-spec'],
   },
   {
      section: 'Developer guide',
      path: 'developer/repeat-blocks',
      title: 'Repeating collections',
      file: 'developer/repeat-blocks.md',
      order: 42,
      segments: ['developer', 'repeat-blocks'],
   },
   {
      section: 'Developer guide',
      path: 'developer/e2e',
      title: 'End-to-end tests',
      file: 'developer/e2e.md',
      order: 43,
      segments: ['developer', 'e2e'],
   },
   {
      section: 'Developer guide',
      path: 'developer/releasing',
      title: 'Releasing',
      file: 'developer/releasing.md',
      order: 44,
      segments: ['developer', 'releasing'],
   },
   {
      section: 'Developer guide',
      path: 'developer/remote-cache',
      title: 'Turborepo remote cache',
      file: 'developer/remote-cache.md',
      order: 45,
      segments: ['developer', 'remote-cache'],
   },

   // Reference
   {
      section: 'Reference',
      path: 'developer/reference/api',
      title: 'HTTP API',
      file: 'developer/reference/api.md',
      order: 60,
      segments: ['developer', 'reference', 'api'],
   },
   {
      section: 'Reference',
      path: 'developer/reference/mcp-tools',
      title: 'MCP tools',
      file: 'developer/reference/mcp-tools.md',
      order: 61,
      segments: ['developer', 'reference', 'mcp-tools'],
   },

   // Project
   {
      section: 'Project',
      path: 'project/positioning',
      title: 'Positioning',
      file: 'project/positioning.md',
      order: 70,
      segments: ['project', 'positioning'],
   },
   {
      section: 'Project',
      path: 'project/comparison',
      title: 'Comparison with beehiiv',
      file: 'project/comparison.md',
      order: 71,
      segments: ['project', 'comparison'],
   },
   {
      section: 'Project',
      path: 'project/branding',
      title: 'Brand and naming',
      file: 'BRANDING.md',
      order: 72,
      segments: ['project', 'branding'],
   },

   // Research
   {
      section: 'Research',
      path: 'research/agent-auth-and-emdash',
      title: 'Agent auth and EmDash',
      file: 'research/agent-auth-and-emdash.md',
      order: 80,
      segments: ['research', 'agent-auth-and-emdash'],
   },
   {
      section: 'Research',
      path: 'research/beehiiv-backlog',
      title: 'beehiiv backlog',
      file: 'research/beehiiv-backlog.md',
      order: 81,
      segments: ['research', 'beehiiv-backlog'],
   },
   {
      section: 'Research',
      path: 'research/email-platform-patterns',
      title: 'Email platform patterns',
      file: 'research/email-platform-patterns.md',
      order: 82,
      segments: ['research', 'email-platform-patterns'],
   },
];

export const DOC_LINKS: DocLink[] = [
   {
      section: 'Links',
      title: 'GitHub',
      href: 'https://github.com/calycode/postwren',
   },
   {
      section: 'Links',
      title: 'README',
      href: 'https://github.com/calycode/postwren#readme',
   },
   {
      section: 'Links',
      title: 'Changelog',
      href: 'https://github.com/calycode/postwren/blob/main/CHANGELOG.md',
   },
   {
      section: 'Links',
      title: 'MIT license',
      href: 'https://github.com/calycode/postwren/blob/main/LICENSE',
   },
   {
      section: 'Links',
      title: 'Issues',
      href: 'https://github.com/calycode/postwren/issues',
   },
];
