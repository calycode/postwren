import type { ComponentChildren } from 'preact';
import type { CSSProperties } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'preact-iso';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { Button, cn } from '@postwren/ui';
import { useAuth } from './auth';

export const GUIDE_SEEN_KEY = 'postwren-guide-seen';

type GuideStep = {
   title: string;
   body: string;
   /** At least one of target/href. Without a target the card is centred. */
   target?: string;
   href?: string;
};

const STEPS: readonly GuideStep[] = [
   {
      title: 'Welcome to Postwren',
      body: 'Postwren builds and sends email from one workspace. This short tour shows where everything lives. You can replay it any time from the Guide button at the bottom of the sidebar.',
   },
   {
      target: '[data-guide="nav"]',
      title: 'Your workspace',
      body: 'Subscribers are the people you can email. Tags group them. Templates are reusable emails. Campaigns pin a template and send it to an audience.',
   },
   {
      href: '/subscribers',
      target: '[data-guide="subscribers-actions"]',
      title: 'Build your list',
      body: 'Add people one at a time, import a CSV, or let a website sign them up through a public subscribe key. Export takes the current list with you.',
   },
   {
      href: '/subscribers',
      target: '[data-guide="subscribers-table"]',
      title: 'Select several at once',
      body: 'Tick the boxes to add tags, set custom fields such as company, or delete in bulk. Double-click any row to open the full editor.',
   },
   {
      href: '/templates',
      target: '[data-guide="templates-actions"]',
      title: 'Start with a template',
      body: 'A template is the email design. Create one, then open it to use the editor.',
   },
   {
      href: '/templates',
      target: '[data-guide="templates-table"]',
      title: 'The editor, at a glance',
      body: 'Inside the editor the left sidebar holds block types and the block tree, the middle is the live email, and the right sidebar edits the selected block. Drag blocks in the tree to reorder them.',
   },
   {
      href: '/campaigns',
      target: '[data-guide="campaigns-actions"]',
      title: 'Send a campaign',
      body: 'Pick a template revision and an audience. Create the campaign first; scheduling and sending happen on its detail page.',
   },
   {
      href: '/tags',
      target: '[data-guide="tags-create"]',
      title: 'Keep segments tidy',
      body: 'Create tags here, or as you go while editing a subscriber. Campaign audiences use them as filters.',
   },
   {
      href: '/settings',
      target: '[data-guide="settings-senders"]',
      title: 'Verify a sender',
      body: 'Add your domain in Cloudflare Email Service, then record the address here. Campaigns can only send from verified addresses.',
   },
   {
      target: '[data-guide="sidebar-footer"]',
      title: 'You are all set',
      body: 'Theme, account and this guide live at the bottom of the sidebar. Collapse the sidebar with the button above them whenever you want more room.',
   },
];

type GuideContextValue = {
   openGuide: () => void;
   closeGuide: () => void;
   active: boolean;
};

const GuideContext = createContext<GuideContextValue>({
   openGuide: () => undefined,
   closeGuide: () => undefined,
   active: false,
});

type Rect = {
   top: number;
   left: number;
   width: number;
   height: number;
   bottom: number;
   right: number;
};

function visibleRect(element: Element | null): Rect | null {
   if (element === null) return null;
   const rect = element.getBoundingClientRect();
   if (rect.width === 0 && rect.height === 0) return null;
   if (rect.right <= 0 || rect.left >= window.innerWidth) return null;
   if (rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
   return rect;
}

function markSeen() {
   try {
      window.localStorage.setItem(GUIDE_SEEN_KEY, '1');
   } catch {
      // Private browsing can refuse storage; the tour simply replays next visit.
   }
}

function hasSeen() {
   try {
      return window.localStorage.getItem(GUIDE_SEEN_KEY) !== null;
   } catch {
      return false;
   }
}

const CARD_WIDTH = 336;
const CARD_HEIGHT_ESTIMATE = 210;

export function GuideProvider({ children }: { children: ComponentChildren }) {
   const { path, route } = useLocation();
   const { status } = useAuth();
   const [active, setActive] = useState(false);
   const [index, setIndex] = useState(0);
   const [rect, setRect] = useState<Rect | null>(null);
   const [ready, setReady] = useState(false);
   const autoStarted = useRef(false);

   const closeGuide = useCallback(() => {
      markSeen();
      setActive(false);
   }, []);

   const openGuide = useCallback(() => {
      setIndex(0);
      setRect(null);
      setReady(false);
      setActive(true);
   }, []);

   useEffect(() => {
      if (status !== 'signed-in' || autoStarted.current) return;
      autoStarted.current = true;

      if (!hasSeen()) {
         setActive(true);
      }
   }, [status]);

   const step = STEPS[index];

   useEffect(() => {
      if (!active || step === undefined) return;

      if (step.href !== undefined && path !== step.href) {
         route(step.href);
         return;
      }

      let frame = 0;
      let attempts = 0;
      setReady(false);

      const measure = () => {
         if (step.target === undefined) {
            setRect(null);
            setReady(true);
            return;
         }

         const element = document.querySelector(step.target);
         const next = visibleRect(element);
         if (next !== null) {
            setRect(next);
            setReady(true);
            return;
         }

         attempts += 1;
         if (attempts < 90) {
            frame = window.requestAnimationFrame(measure);
         } else {
            setRect(null);
            setReady(true);
         }
      };

      measure();
      return () => window.cancelAnimationFrame(frame);
   }, [active, index, path, route, step]);

   useEffect(() => {
      if (!active || step?.target === undefined) return;

      const update = () => {
         setRect(visibleRect(document.querySelector(step.target ?? '')));
      };

      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      return () => {
         window.removeEventListener('resize', update);
         window.removeEventListener('scroll', update, true);
      };
   }, [active, step]);

   useEffect(() => {
      if (!active) return;

      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') {
            event.preventDefault();
            closeGuide();
         } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            setIndex((current) => Math.min(current + 1, STEPS.length - 1));
         } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setIndex((current) => Math.max(current - 1, 0));
         }
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [active, closeGuide]);

   const isLast = index === STEPS.length - 1;

   function next() {
      if (isLast) {
         closeGuide();
         return;
      }
      setIndex((current) => current + 1);
   }

   function back() {
      setIndex((current) => Math.max(current - 1, 0));
   }

   let cardStyle: CSSProperties | undefined;
   if (rect !== null) {
      const left = Math.min(
         Math.max(rect.left + rect.width / 2 - CARD_WIDTH / 2, 12),
         window.innerWidth - CARD_WIDTH - 12,
      );
      const below = rect.bottom + 12 + CARD_HEIGHT_ESTIMATE < window.innerHeight;
      const top = below ? rect.bottom + 12 : Math.max(12, rect.top - CARD_HEIGHT_ESTIMATE - 12);
      cardStyle = { left: `${left}px`, top: `${top}px`, width: `${CARD_WIDTH}px` };
   }

   return (
      <GuideContext.Provider value={{ openGuide, closeGuide, active }}>
         {children}

         {active && step !== undefined && ready && (
            <div
               data-slot="guide"
               className="fixed inset-0 z-[90]"
               role="dialog"
               aria-modal="true"
               aria-label="Product tour"
            >
               <button
                  type="button"
                  aria-label="Close the tour"
                  className="absolute inset-0 size-full cursor-default bg-transparent"
                  onClick={closeGuide}
               />

               {rect !== null && (
                  <div
                     aria-hidden="true"
                     className="pointer-events-none absolute rounded-lg border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                     style={{
                        top: `${rect.top - 4}px`,
                        left: `${rect.left - 4}px`,
                        width: `${rect.width + 8}px`,
                        height: `${rect.height + 8}px`,
                     }}
                  />
               )}

               <div
                  className={cn(
                     'absolute z-10 grid gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl',
                     rect === null &&
                        'top-1/2 left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
                  )}
                  style={cardStyle}
               >
                  <div className="flex items-start justify-between gap-3">
                     <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Sparkles
                           className="size-4 text-primary"
                           aria-hidden="true"
                        />
                        Step {index + 1} of {STEPS.length}
                     </div>
                     <button
                        type="button"
                        aria-label="Close the tour"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={closeGuide}
                     >
                        <X
                           className="size-4"
                           aria-hidden="true"
                        />
                     </button>
                  </div>

                  <div className="grid gap-1.5">
                     <h2 className="font-heading text-base font-semibold">{step.title}</h2>
                     <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2">
                     <button
                        type="button"
                        className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        onClick={closeGuide}
                     >
                        Skip tour
                     </button>
                     <div className="flex items-center gap-2">
                        {index > 0 && (
                           <Button
                              size="sm"
                              variant="ghost"
                              onClick={back}
                           >
                              <ArrowLeft aria-hidden="true" />
                              Back
                           </Button>
                        )}
                        <Button
                           size="sm"
                           onClick={next}
                        >
                           {isLast ? 'Finish' : 'Next'}
                           {!isLast && <ArrowRight aria-hidden="true" />}
                        </Button>
                     </div>
                  </div>
               </div>
            </div>
         )}
      </GuideContext.Provider>
   );
}

export function useGuide(): GuideContextValue {
   return useContext(GuideContext);
}
