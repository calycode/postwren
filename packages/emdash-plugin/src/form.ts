import type { PageFragmentContribution } from 'emdash';
import { ROUTE_BASE } from './index';

export interface SignupFormOptions {
   heading: string;
}

const FORM_ID = 'postwren-signup-form';
const EMAIL_ID = 'postwren-signup-email';
const WEBSITE_ID = 'postwren-signup-website';
const STATUS_CLASS = 'postwren-signup__status';

function escapeHtml(value: string): string {
   return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/**
 * Colours come from CSS system keywords so the form inherits the site's
 * light/dark scheme without importing tokens or hex values.
 */
const STYLES = `<style>
.postwren-signup{display:flex;flex-wrap:wrap;gap:.5rem;align-items:flex-end;margin:2rem auto;max-width:32rem;font:inherit;color:inherit}
.postwren-signup__heading{flex:1 1 100%;margin:0;font-size:1.125rem;font-weight:600}
.postwren-signup__field{display:flex;flex:1 1 14rem;flex-direction:column;gap:.25rem}
.postwren-signup__label,.postwren-signup__hp{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.postwren-signup input{font:inherit;padding:.5rem .625rem;border:1px solid;border-radius:.375rem;background:Field;color:FieldText}
.postwren-signup button{font:inherit;padding:.5rem 1rem;border:1px solid CanvasText;border-radius:.375rem;background:CanvasText;color:Canvas;cursor:pointer}
.postwren-signup button[disabled]{opacity:.6;cursor:progress}
.postwren-signup__status{flex:1 1 100%;margin:0;font-size:.875rem}
</style>`;

function formHtml(options: SignupFormOptions): string {
   const heading = escapeHtml(options.heading);
   return `<section class="postwren-signup" aria-labelledby="${FORM_ID}-heading">${STYLES}
<h2 class="postwren-signup__heading" id="${FORM_ID}-heading">${heading}</h2>
<form class="postwren-signup__form" id="${FORM_ID}" data-postwren-signup>
<div class="postwren-signup__field">
<label class="postwren-signup__label" for="${EMAIL_ID}">Email address</label>
<input id="${EMAIL_ID}" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
</div>
<div class="postwren-signup__hp" aria-hidden="true">
<label for="${WEBSITE_ID}">Website</label>
<input id="${WEBSITE_ID}" name="website" type="text" tabindex="-1" autocomplete="off">
</div>
<button type="submit">Subscribe</button>
<p class="${STATUS_CLASS}" role="status" aria-live="polite"></p>
</form>
</section>`;
}

const SCRIPT = `(function () {
  var forms = document.querySelectorAll('[data-postwren-signup]');
  Array.prototype.forEach.call(forms, function (form) {
    var status = form.querySelector('.${STATUS_CLASS}');
    var button = form.querySelector('button[type="submit"]');
    function say(message) { if (status) status.textContent = message; }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var email = String(data.get('email') || '').trim();
      if (!email) { say('Enter your email address.'); return; }
      if (button) button.disabled = true;
      say('Subscribing\u2026');
      fetch(${JSON.stringify(`${ROUTE_BASE}/signup`)}, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-EmDash-Request': '1' },
        body: JSON.stringify({
          email: email,
          website: String(data.get('website') || ''),
          sourceUrl: location.href
        })
      }).then(function (response) {
        if (response.ok) {
          form.reset();
          say('Thanks \u2014 you are on the list.');
          return;
        }
        if (response.status === 429) {
          say('Too many signups right now. Please try again in a minute.');
          return;
        }
        if (response.status === 422) {
          say('That email address does not look right.');
          return;
        }
        say('Signup is unavailable right now. Please try again later.');
      }).catch(function () {
        say('Network error. Please try again.');
      }).then(function () {
        if (button) button.disabled = false;
      });
    });
  });
})();`;

export function signupFormFragments(options: SignupFormOptions): PageFragmentContribution[] {
   return [
      { kind: 'html', placement: 'body:end', html: formHtml(options), key: 'postwren-signup-form' },
      { kind: 'inline-script', placement: 'body:end', code: SCRIPT, key: 'postwren-signup-script' },
   ];
}
