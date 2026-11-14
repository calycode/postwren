import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(ROOT, 'packages', 'docs', 'dist');
const TEMPLATE = path.join(ROOT, 'util-resources', 'docs-template');

const BASE = (process.env.DOCS_BASE ?? '').replace(/\/$/, '');
const SITE_URL = (process.env.DOCS_SITE_URL ?? 'https://postwren.email').replace(/\/$/, '');
const REPO_URL = 'https://github.com/calycode/postwren/blob/main';
const REPO_PREFIXES = ['/packages/', '/migrations/', '/scripts/', '/e2e/'];
const HAS_OG_IMAGE = existsSync(path.join(DOCS, '_media', 'og-image.png'));

type ManifestEntry = {
   section: string;
   path: string;
   title: string;
   group: string | null;
   parent: string | null;
   order: number;
   source: string;
   segments: string[];
   file: string;
};

type ManifestLink = { section: string; title: string; href: string };

type Manifest = {
   version: number;
   generatedAt: string;
   hash?: string;
   entries: ManifestEntry[];
   links: ManifestLink[];
};

const asset = (relative: string) => `${BASE}/${relative}`;
const docsUrl = (entryPath: string) =>
   entryPath === ''
      ? `${BASE}/docs/`
      : entryPath.endsWith('/')
        ? `${BASE}/docs/${entryPath}`
        : `${BASE}/docs/${entryPath}.html`;
const rawUrl = (entryPath: string) =>
   entryPath === ''
      ? `${BASE}/docs/index.md`
      : entryPath.endsWith('/')
        ? `${BASE}/docs/${entryPath}README.md`
        : `${BASE}/docs/${entryPath}.md`;
const canonicalUrl = (entryPath: string) =>
   entryPath === ''
      ? `${SITE_URL}/docs/`
      : entryPath.endsWith('/')
        ? `${SITE_URL}/docs/${entryPath}`
        : `${SITE_URL}/docs/${entryPath}.html`;
const ogImageTags = HAS_OG_IMAGE
   ? `<meta property="og:image" content="${SITE_URL}/assets/media/og-image.png" />`
   : '';

/**
 * The flat docs/ files moved into user/, developer/ and project/ buckets. Old
 * Markdown still links to the uppercase names, so resolve those first instead of
 * rewriting every historical reference.
 */
const LEGACY_FILES: Record<string, string> = {
   'AGENT-ACCESS.md': 'developer/agent-access',
   'APPFLARE.md': 'developer/appflare',
   'AUTOMATIONS.md': 'developer/automation-spec',
   'BRANDING.md': 'project/branding',
   'COMPARISON.md': 'project/comparison',
   'E2E.md': 'developer/e2e',
   'EMAIL-EVENTS.md': 'developer/email-events',
   'EMDASH-PLUGIN.md': 'developer/emdash-plugin',
   'IFRAME-EMBEDDING.md': 'developer/iframe-embedding',
   'POSITIONING.md': 'project/positioning',
   'PUBLIC-SUBSCRIBE.md': 'developer/public-subscribe',
   'RELEASING.md': 'developer/releasing',
   'REMOTE-CACHE.md': 'developer/remote-cache',
   'REPEAT-BLOCKS.md': 'developer/repeat-blocks',
   'UI-REVIEW.md': 'project/ui-review',
   'WEBHOOKS.md': 'developer/webhooks',
   'beehiiv-backlog.md': 'research/beehiiv-backlog',
   'agent-auth-and-emdash.md': 'research/agent-auth-and-emdash',
   'email-platform-patterns.md': 'research/email-platform-patterns',
};

function escapeHtml(value: string): string {
   return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

function stripTags(html: string): string {
   return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
}

function normalizeText(html: string): string {
   return stripTags(html).replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
   return normalizeText(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
}

function addHeadingIds(html: string): string {
   return html.replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (match, level: string, body: string) => {
      const id = slugify(body);
      return id ? `<h${level} id="${id}">${body}</h${level}>` : match;
   });
}

function rewriteUrl(value: string, kind: 'href' | 'src', currentPath: string): string {
   if (/^(https?:|mailto:|tel:|#|\/\/|data:)/.test(value)) return value;

   let next = value;
   if (next.startsWith('./')) next = next.slice(2);

   if (kind === 'src' || /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(next)) {
      if (next.startsWith('_media/')) return asset(`assets/media/${next.slice('_media/'.length)}`);
      if (next.startsWith('/')) return `${BASE}${next}`;
      return next;
   }

   const [pathPart, hash = ''] = next.split('#');
   if (!pathPart) return `#${hash}`;
   if (pathPart.startsWith('/')) {
      if (REPO_PREFIXES.some((prefix) => pathPart.startsWith(prefix))) {
         return `${REPO_URL}${pathPart}${hash ? `#${hash}` : ''}`;
      }
      return `${BASE}${pathPart}${hash ? `#${hash}` : ''}`;
   }

   const legacy = LEGACY_FILES[path.posix.basename(pathPart).toLowerCase()];
   if (legacy !== undefined) {
      return `${BASE}/docs/${legacy}${hash ? `#${hash}` : ''}`;
   }

   const currentDir =
      currentPath === ''
         ? ''
         : currentPath.endsWith('/')
           ? currentPath.slice(0, -1)
           : path.posix.dirname(currentPath);
   let resolved = path.posix.normalize(path.posix.join(currentDir, pathPart));

   if (resolved.startsWith('..')) {
      const rootFile = resolved.replace(/^(\.\.\/)+/, '');
      const repoPath = `/${rootFile}`;
      if (REPO_PREFIXES.some((prefix) => repoPath.startsWith(prefix))) {
         return `${REPO_URL}${repoPath}${hash ? `#${hash}` : ''}`;
      }
      return `${REPO_URL}/${rootFile}${hash ? `#${hash}` : ''}`;
   }

   if (resolved.endsWith('.md')) resolved = `${resolved.slice(0, -3)}.html`;
   if (resolved === 'README.html' || resolved === '') {
      return `${BASE}/docs/${hash ? `#${hash}` : ''}`;
   }
   if (resolved.endsWith('/README.html')) {
      return `${BASE}/docs/${resolved.slice(0, -'README.html'.length)}${hash ? `#${hash}` : ''}`;
   }
   return `${BASE}/docs/${resolved}${hash ? `#${hash}` : ''}`;
}

function rewriteLinks(html: string, currentPath: string): string {
   return html
      .replace(
         /\bhref="([^"]+)"/g,
         (_match, value: string) => `href="${rewriteUrl(value, 'href', currentPath)}"`,
      )
      .replace(
         /\bsrc="([^"]+)"/g,
         (_match, value: string) => `src="${rewriteUrl(value, 'src', currentPath)}"`,
      );
}

function renderArticle(markdown: string, currentPath: string): string {
   const html = marked.parse(markdown, { gfm: true, breaks: false }) as string;
   return rewriteLinks(addHeadingIds(html), currentPath);
}

function headingsOf(html: string): string[] {
   const headings: string[] = [];
   const regex = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
   let match: RegExpExecArray | null;
   while ((match = regex.exec(html))) {
      const text = normalizeText(match[1]);
      if (text) headings.push(text);
   }
   return headings;
}

function descriptionOf(html: string): string {
   return normalizeText(html).split(' ').slice(0, 30).join(' ');
}

function renderSidebar(manifest: Manifest, currentPath: string): string {
   const parts: string[] = [
      '<div class="d-search">' +
         '<input id="d-search-input" class="d-search__input" type="search" placeholder="Search docs…  (/)" ' +
         'aria-label="Search documentation" autocomplete="off" />' +
         '<div id="d-search-results" class="d-search__results" role="listbox" hidden></div>' +
         '</div>',
   ];

   const sections = new Map<string, ManifestEntry[]>();
   for (const entry of manifest.entries) {
      if (!sections.has(entry.section)) sections.set(entry.section, []);
      sections.get(entry.section)!.push(entry);
   }

   for (const [section, entries] of sections) {
      const sorted = entries.sort((a, b) => a.order - b.order);
      parts.push(`<div class="d-nav__section">${escapeHtml(section)}</div>`);
      parts.push(
         `<ul class="d-nav">${sorted
            .map((entry) => {
               const active = entry.path === currentPath ? ' is-active' : '';
               return `<li class="d-nav__item"><div class="d-nav__row"><span class="d-nav__spacer" aria-hidden="true"></span><a class="d-nav__link${active}" href="${docsUrl(
                  entry.path,
               )}">${escapeHtml(entry.title)}</a></div></li>`;
            })
            .join('')}</ul>`,
      );
   }

   const linkSections = new Map<string, ManifestLink[]>();
   for (const link of manifest.links) {
      if (!linkSections.has(link.section)) linkSections.set(link.section, []);
      linkSections.get(link.section)!.push(link);
   }
   for (const [section, links] of linkSections) {
      parts.push(`<div class="d-nav__section">${escapeHtml(section)}</div>`);
      parts.push(
         `<ul class="d-nav">${links
            .map(
               (link) =>
                  `<li class="d-nav__item"><div class="d-nav__row"><span class="d-nav__spacer" aria-hidden="true"></span><a class="d-nav__link" href="${escapeHtml(
                     link.href,
                  )}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a></div></li>`,
            )
            .join('')}</ul>`,
      );
   }

   return parts.join('\n');
}

function renderPager(
   entries: ManifestEntry[],
   currentPath: string,
): { prev: string; next: string } {
   const index = entries.findIndex((entry) => entry.path === currentPath);
   const previous = index > 0 ? entries[index - 1] : null;
   const next = index >= 0 && index < entries.length - 1 ? entries[index + 1] : null;
   const link = (entry: ManifestEntry | null, direction: 'prev' | 'next') =>
      entry
         ? `<a class="d-pager__link d-pager__link--${direction}" href="${docsUrl(
              entry.path,
           )}"><span class="d-pager__dir">${
              direction === 'prev' ? 'Previous' : 'Next'
           }</span><span class="d-pager__title">${escapeHtml(entry.title)}</span></a>`
         : '';
   return { prev: link(previous, 'prev'), next: link(next, 'next') };
}

function fill(template: string, values: Record<string, string>): string {
   return template.replace(/%%([A-Z_]+)%%/g, (match, key: string) => values[key] ?? match);
}

function write(relative: string, content: string | Buffer): void {
   const target = path.join(OUT, relative);
   mkdirSync(path.dirname(target), { recursive: true });
   writeFileSync(target, content);
}

async function main(): Promise<void> {
   console.log(`Building docs for base "${BASE || '/'}"\n`);

   rmSync(OUT, { recursive: true, force: true });
   mkdirSync(OUT, { recursive: true });

   const manifest = JSON.parse(readFileSync(path.join(DOCS, 'manifest.json'), 'utf8')) as Manifest;
   const shell = readFileSync(path.join(TEMPLATE, 'shell.html'), 'utf8');
   const landing = readFileSync(path.join(TEMPLATE, 'landing.html'), 'utf8');
   const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      version: string;
   };

   cpSync(path.join(TEMPLATE, 'docs.css'), path.join(OUT, 'assets', 'docs.css'));
   if (existsSync(path.join(DOCS, '_media'))) {
      cpSync(path.join(DOCS, '_media'), path.join(OUT, 'assets', 'media'), { recursive: true });
   }

   // The app's brand assets are the source of truth. `pnpm brand:assets` rebuilds
   // them in packages/webapp/public, so the docs pick up a logo change for free.
   const brandAssets: Array<[string, string]> = [
      ['packages/webapp/public/brand/postwren-wordmark.png', 'postwren-wordmark.png'],
      ['packages/webapp/public/brand/postwren-mark.png', 'postwren-mark.png'],
      ['packages/webapp/public/favicon.ico', 'favicon.ico'],
      ['packages/webapp/public/favicon-32.png', 'favicon-32.png'],
      ['packages/webapp/public/apple-touch-icon.png', 'apple-touch-icon.png'],
   ];
   for (const [source, target] of brandAssets) {
      const from = path.join(ROOT, source);
      if (!existsSync(from)) continue;
      const to = path.join(OUT, 'assets', 'media', target);
      mkdirSync(path.dirname(to), { recursive: true });
      cpSync(from, to);
   }
   for (const file of ['LICENSE', 'CHANGELOG.md']) {
      if (existsSync(path.join(ROOT, file))) cpSync(path.join(ROOT, file), path.join(OUT, file));
   }

   const client = await build({
      entryPoints: [path.join(ROOT, 'scripts', 'docs', 'client.ts')],
      bundle: true,
      minify: true,
      format: 'iife',
      target: ['es2020'],
      write: false,
      logLevel: 'warning',
   });
   writeFileSync(path.join(OUT, 'assets', 'docs.js'), client.outputFiles[0].text);

   const searchRecords: Array<Record<string, unknown>> = [];
   const manifestVersion = String(manifest.hash ?? manifest.generatedAt);

   for (const entry of manifest.entries) {
      const markdown = readFileSync(path.join(DOCS, entry.file), 'utf8');
      const content = renderArticle(markdown, entry.path);
      const pager = renderPager(manifest.entries, entry.path);
      const description = escapeHtml(descriptionOf(content));

      const values: Record<string, string> = {
         BASE,
         MANIFEST_VERSION: manifestVersion,
         TITLE: escapeHtml(entry.title),
         DESCRIPTION: description,
         CANONICAL: canonicalUrl(entry.path),
         MD_HREF: rawUrl(entry.path),
         OG_IMAGE_TAGS: ogImageTags,
         CURRENT_PATH: entry.path,
         INDEX_URL: asset('assets/search-index.json'),
         SIDEBAR: renderSidebar(manifest, entry.path),
         CONTENT: content,
         HEAD_ASSETS: '',
         BODY_ASSETS: '',
         PREV: pager.prev,
         NEXT: pager.next,
      };

      const pageRelative =
         entry.path === ''
            ? 'docs/index.html'
            : entry.path.endsWith('/')
              ? `docs/${entry.path}index.html`
              : `docs/${entry.path}.html`;
      const rawRelative =
         entry.path === ''
            ? 'docs/index.md'
            : entry.path.endsWith('/')
              ? `docs/${entry.path}README.md`
              : `docs/${entry.path}.md`;
      write(pageRelative, fill(shell, values));
      write(rawRelative, markdown);

      searchRecords.push({
         path: entry.path,
         url: docsUrl(entry.path),
         title: entry.title,
         section: entry.section,
         group: entry.group,
         headings: headingsOf(content),
         text: normalizeText(content).slice(0, 8000),
      });
   }

   write('assets/search-index.json', JSON.stringify(searchRecords));
   write('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
   write(
      'docs.html',
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Postwren docs</title>` +
         `<meta http-equiv="refresh" content="0; url=${BASE}/docs/"><link rel="canonical" href="${SITE_URL}/docs/">` +
         `<meta name="robots" content="noindex"></head><body><a href="${BASE}/docs/">Postwren docs</a></body></html>`,
   );

   write(
      'index.html',
      fill(landing, {
         BASE,
         MANIFEST_VERSION: manifestVersion,
         CANONICAL: `${SITE_URL}/`,
         OG_IMAGE_TAGS: ogImageTags,
         VERSION: pkg.version,
         GENERATED_AT: new Date(manifest.generatedAt).toISOString().slice(0, 10),
      }),
   );

   const urls = [`${SITE_URL}/`, ...manifest.entries.map((entry) => canonicalUrl(entry.path))];
   write(
      'sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
         urls
            .map(
               (url) =>
                  `   <url><loc>${url}</loc><priority>${url.endsWith('/docs/') ? '0.9' : '0.8'}</priority></url>`,
            )
            .join('\n') +
         `\n</urlset>\n`,
   );
   write(
      '404.html',
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
         `<meta name="viewport" content="width=device-width, initial-scale=1">` +
         `<meta name="color-scheme" content="light dark">` +
         `<title>Page not found — Postwren docs</title>` +
         `<link rel="stylesheet" href="${BASE}/assets/docs.css"></head>` +
         `<body><main style="max-width:40rem;margin:12vh auto;padding:0 1.5rem;font-family:system-ui,sans-serif">` +
         `<h1>Page not found</h1><p>That page does not exist in the Postwren docs.</p>` +
         `<p><a href="${BASE}/docs/">Browse the documentation</a> or ` +
         `<a href="${BASE}/">go to the landing page</a>.</p>` +
         `</main></body></html>`,
   );

   console.log(
      `Rendered ${manifest.entries.length} pages, ${searchRecords.length} search records.`,
   );
   console.log(`Output: ${OUT}`);
}

main().catch((error) => {
   console.error('Failed to build docs:', error);
   process.exit(1);
});
