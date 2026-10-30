import { describe, expect, it } from 'vitest';
import { signupFormFragments } from '../src/form';
import { ROUTE_BASE } from '../src/index';

function collect(options = { heading: 'Newsletter' }): { html: string; script: string } {
   const fragments = signupFormFragments(options);
   const html = fragments.find((fragment) => fragment.kind === 'html');
   const script = fragments.find((fragment) => fragment.kind === 'inline-script');

   if (html?.kind !== 'html' || script?.kind !== 'inline-script') {
      throw new Error('Expected one html and one inline-script fragment');
   }

   return { html: html.html, script: script.code };
}

describe('signupFormFragments', () => {
   it('returns the form markup and its script at the end of the body', () => {
      const fragments = signupFormFragments({ heading: 'Newsletter' });

      expect(fragments.map((fragment) => fragment.placement)).toEqual(['body:end', 'body:end']);
      expect(fragments.map((fragment) => fragment.kind)).toEqual(['html', 'inline-script']);
   });

   it('posts to the plugin route that keeps the key off the page', () => {
      const { script } = collect();

      expect(script).toContain(`${ROUTE_BASE}/signup`);
      expect(script).toContain('X-EmDash-Request');
      expect(script).not.toContain('pk_live');
      expect(script).not.toContain('authorization');
   });

   it('labels the email field and announces the result', () => {
      const { html } = collect();

      expect(html).toContain('type="email"');
      expect(html).toContain('autocomplete="email"');
      expect(html).toContain('for="mailer-signup-email"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
   });

   it('hides a honeypot field from people and assistive technology', () => {
      const { html } = collect();

      expect(html).toContain('name="website"');
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('autocomplete="off"');
   });

   it('escapes the heading instead of injecting it into every page', () => {
      const { html } = collect({ heading: '<img src=x onerror="alert(1)">' });

      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
   });

   it('loads no external assets', () => {
      const { html, script } = collect();

      expect(`${html}${script}`).not.toMatch(/https?:\/\//);
      expect(html).not.toContain('<link');
   });

   it('scopes its styles to its own class prefix', () => {
      const { html } = collect();

      expect(html).toContain('.mailer-signup{');
      expect(html).toMatch(/^<section class="mailer-signup"/);
   });
});
