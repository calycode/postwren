import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import {
   Check,
   ChevronDown,
   Compass,
   FileText,
   House,
   LogOut,
   Menu,
   Monitor,
   Moon,
   PanelLeftClose,
   PanelLeftOpen,
   Send,
   Settings,
   Sun,
   Tag,
   Users,
   Workflow,
   X,
} from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
   cn,
} from '@postwren/ui';
import { useAuth } from '@/lib/auth';
import { useGuide } from '@/lib/guide';
import { useTheme } from '@/lib/theme';
import type { ThemeMode } from '@/lib/theme';

const SIDEBAR_COLLAPSED_KEY = 'postwren-sidebar-collapsed';

type NavItem = {
   href: string;
   label: string;
   icon: ComponentChildren;
};

const NAV_GROUPS: readonly { label: string; items: readonly NavItem[] }[] = [
   {
      label: 'Audience',
      items: [
         {
            href: '/subscribers',
            label: 'Subscribers',
            icon: (
               <Users
                  className="size-4"
                  aria-hidden="true"
               />
            ),
         },
         {
            href: '/tags',
            label: 'Tags',
            icon: (
               <Tag
                  className="size-4"
                  aria-hidden="true"
               />
            ),
         },
      ],
   },
   {
      label: 'Email',
      items: [
         {
            href: '/templates',
            label: 'Templates',
            icon: (
               <FileText
                  className="size-4"
                  aria-hidden="true"
               />
            ),
         },
         {
            href: '/campaigns',
            label: 'Campaigns',
            icon: (
               <Send
                  className="size-4"
                  aria-hidden="true"
               />
            ),
         },
         {
            href: '/automations',
            label: 'Automations',
            icon: (
               <Workflow
                  className="size-4"
                  aria-hidden="true"
               />
            ),
         },
      ],
   },
   {
      label: 'Workspace',
      items: [
         {
            href: '/settings',
            label: 'Settings',
            icon: (
               <Settings
                  className="size-4"
                  aria-hidden="true"
               />
            ),
         },
      ],
   },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: ComponentChildren }[] = [
   {
      value: 'light',
      label: 'Light',
      icon: (
         <Sun
            className="size-4"
            aria-hidden="true"
         />
      ),
   },
   {
      value: 'dark',
      label: 'Dark',
      icon: (
         <Moon
            className="size-4"
            aria-hidden="true"
         />
      ),
   },
   {
      value: 'system',
      label: 'System',
      icon: (
         <Monitor
            className="size-4"
            aria-hidden="true"
         />
      ),
   },
];

function isActive(path: string, href: string): boolean {
   return path === href || path.startsWith(`${href}/`);
}

function readCollapsed(): boolean {
   try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
   } catch {
      return false;
   }
}

export function AppShell({ children }: { children: ComponentChildren }) {
   const { path, route } = useLocation();
   const { user, signOut } = useAuth();
   const { mode, setMode } = useTheme();
   const { openGuide } = useGuide();
   const [mobileOpen, setMobileOpen] = useState(false);
   const [collapsed, setCollapsed] = useState(readCollapsed);

   const activeItem = [
      { href: '/', label: 'Home' } as NavItem,
      ...NAV_GROUPS.flatMap((group) => group.items),
   ].find((item) => (item.href === '/' ? path === '/' : isActive(path, item.href)));
   const pageTitle = activeItem?.label ?? 'Postwren';
   // The mobile drawer always shows labels, even when the desktop rail is compact.
   const compact = collapsed && !mobileOpen;
   const initial = user?.email ? user.email.slice(0, 1).toUpperCase() : 'A';
   const brandContent = (
      <>
         <span className="group/logo relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            {compact ? (
               <PanelLeftOpen
                  className="size-4"
                  aria-hidden="true"
               />
            ) : (
               <>
                  <Send
                     className="size-4 transition-opacity group-hover/logo:opacity-0"
                     aria-hidden="true"
                  />
                  <PanelLeftClose
                     className="absolute size-4 opacity-0 transition-opacity group-hover/logo:opacity-100"
                     aria-hidden="true"
                  />
               </>
            )}
         </span>
         <span
            className={cn(
               'truncate font-display text-[1.35rem] leading-none font-medium tracking-tight',
               compact && 'md:hidden',
            )}
         >
            postwren
         </span>
      </>
   );

   useEffect(() => {
      try {
         window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
      } catch {
         // Storage is optional; the rail still collapses for this session.
      }
   }, [collapsed]);

   async function handleSignOut() {
      await signOut();
      route('/login');
   }

   return (
      <div className="flex min-h-dvh bg-background text-foreground">
         <a
            href="#main-content"
            className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
         >
            Skip to content
         </a>

         {mobileOpen && (
            <button
               type="button"
               aria-label="Close navigation"
               className="fixed inset-0 z-30 bg-black/50 md:hidden"
               onClick={() => setMobileOpen(false)}
            />
         )}

         <aside
            id="app-sidebar"
            className={cn(
               'app-sidebar fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-border bg-sidebar transition-[transform,width] md:sticky md:top-0 md:h-dvh md:translate-x-0',
               collapsed ? 'md:w-[4.5rem]' : 'md:w-60',
               mobileOpen && 'translate-x-0',
            )}
         >
            <div className="flex h-16 items-center gap-2 px-3">
               {compact ? (
                  <button
                     type="button"
                     onClick={() => setCollapsed(false)}
                     className="inline-flex min-w-0 items-center gap-2.5 rounded-lg text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:mx-auto md:size-10 md:justify-center"
                     title="Expand sidebar"
                     aria-label="Expand sidebar"
                  >
                     {brandContent}
                  </button>
               ) : (
                  <div className="inline-flex min-w-0 items-center gap-2.5">
                     <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        className="inline-flex min-w-0 items-center gap-2.5 rounded-lg text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Collapse sidebar"
                        aria-label="Collapse sidebar"
                        aria-pressed={collapsed}
                     >
                        {brandContent}
                     </button>
                  </div>
               )}

               <button
                  type="button"
                  className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
                  aria-label="Close navigation"
                  onClick={() => setMobileOpen(false)}
               >
                  <X
                     className="size-4"
                     aria-hidden="true"
                  />
               </button>
            </div>

            <nav
               aria-label="Main"
               data-guide="nav"
               className="flex-1 overflow-x-hidden overflow-y-auto px-2 py-2"
            >
               <a
                  href="/"
                  aria-current={isActive(path, '/') ? 'page' : undefined}
                  title={compact ? 'Home' : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                     'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                     isActive(path, '/')
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                     compact && 'md:justify-center md:px-0',
                  )}
               >
                  {isActive(path, '/') && (
                     <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-ochre"
                     />
                  )}
                  <House
                     className="size-4"
                     aria-hidden="true"
                  />
                  <span className={cn('truncate', compact && 'md:hidden')}>Home</span>
               </a>

               {NAV_GROUPS.map((group) => (
                  <div
                     key={group.label}
                     className="mt-4 grid gap-0.5"
                  >
                     <p
                        className={cn(
                           'px-3 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase',
                           compact && 'md:hidden',
                        )}
                     >
                        {group.label}
                     </p>
                     <ul className="grid gap-0.5">
                        {group.items.map((item) => {
                           const active = isActive(path, item.href);

                           return (
                              <li key={item.href}>
                                 <a
                                    href={item.href}
                                    aria-current={active ? 'page' : undefined}
                                    title={compact ? item.label : undefined}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                       'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                       active
                                          ? 'bg-accent text-accent-foreground'
                                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                                       compact && 'md:justify-center md:px-0',
                                    )}
                                 >
                                    {active && (
                                       <span
                                          aria-hidden="true"
                                          className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-ochre"
                                       />
                                    )}
                                    {item.icon}
                                    <span className={cn('truncate', compact && 'md:hidden')}>
                                       {item.label}
                                    </span>
                                 </a>
                              </li>
                           );
                        })}
                     </ul>
                  </div>
               ))}
            </nav>

            <div
               data-guide="sidebar-footer"
               className={cn('grid gap-1 border-t border-border p-2', compact && 'md:gap-2')}
            >
               <DropdownMenu className="w-full">
                  <DropdownMenuTrigger
                     aria-label="Account menu"
                     title={compact ? (user?.email ?? 'Account') : undefined}
                     className={cn(
                        'h-auto w-full gap-2.5 rounded-lg border border-transparent bg-transparent px-2 py-2 text-left text-foreground hover:border-border hover:bg-accent/60',
                        compact &&
                           'md:mx-auto md:size-10 md:justify-center md:gap-0 md:px-0 md:py-0',
                     )}
                  >
                     <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-accent text-xs font-semibold text-foreground">
                        {initial}
                     </span>
                     <span className={cn('min-w-0 flex-1', compact && 'md:hidden')}>
                        <span className="block truncate text-xs font-medium">
                           {user?.email ?? 'Account'}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">Signed in</span>
                     </span>
                     <ChevronDown
                        className={cn(
                           'size-3.5 shrink-0 text-muted-foreground',
                           compact && 'md:hidden',
                        )}
                        aria-hidden="true"
                     />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bottom-full left-0 right-auto mb-1 w-60 max-w-[calc(100vw-1rem)]">
                     <div className="px-2 py-1.5">
                        <p className="text-xs text-muted-foreground">Signed in as</p>
                        <p className="max-w-52 truncate text-sm font-medium">
                           {user?.email ?? 'Unknown'}
                        </p>
                     </div>
                     <DropdownMenuSeparator />
                     {THEME_OPTIONS.map((option) => (
                        <DropdownMenuItem
                           key={option.value}
                           aria-pressed={mode === option.value}
                           onSelect={() => setMode(option.value)}
                        >
                           {option.icon}
                           <span className="flex-1">{option.label}</span>
                           {mode === option.value && (
                              <Check
                                 className="size-3.5 text-ochre"
                                 aria-hidden="true"
                              />
                           )}
                        </DropdownMenuItem>
                     ))}
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onSelect={openGuide}>
                        <Compass aria-hidden="true" />
                        Product tour
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onSelect={() => void handleSignOut()}>
                        <LogOut aria-hidden="true" />
                        Sign out
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </aside>

         <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 md:hidden">
               <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open navigation"
                  aria-expanded={mobileOpen}
                  aria-controls="app-sidebar"
                  onClick={() => setMobileOpen(true)}
               >
                  <Menu
                     className="size-4"
                     aria-hidden="true"
                  />
               </button>

               <p className="min-w-0 flex-1 truncate font-display text-lg font-medium">
                  {pageTitle}
               </p>
            </header>

            <main
               id="main-content"
               key={path}
               tabIndex={-1}
               className="page-in mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 outline-none sm:px-6 sm:py-6 lg:px-8 lg:py-8"
            >
               {children}
            </main>
         </div>
      </div>
   );
}
