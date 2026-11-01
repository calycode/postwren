import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'react';
import { useLocation } from 'preact-iso';
import {
   ChevronDown,
   FileText,
   LogOut,
   Menu,
   Monitor,
   Moon,
   PanelLeftClose,
   PanelLeftOpen,
   Send,
   Settings,
   Sparkles,
   Sun,
   Tag,
   Users,
   X,
} from 'lucide-react';
import {
   Button,
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

const NAV_ITEMS = [
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
      href: '/settings',
      label: 'Settings',
      icon: (
         <Settings
            className="size-4"
            aria-hidden="true"
         />
      ),
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
   const { mode, resolved, setMode } = useTheme();
   const { openGuide } = useGuide();
   const [mobileOpen, setMobileOpen] = useState(false);
   const [collapsed, setCollapsed] = useState(readCollapsed);

   const activeItem = NAV_ITEMS.find((item) => isActive(path, item.href));
   const pageTitle = activeItem?.label ?? 'Postwren';
   // The mobile drawer always shows labels, even when the desktop rail is compact.
   const compact = collapsed && !mobileOpen;
   const themeIcon =
      resolved === 'dark' ? (
         <Moon
            className="size-4"
            aria-hidden="true"
         />
      ) : (
         <Sun
            className="size-4"
            aria-hidden="true"
         />
      );
   const themeLabel = THEME_OPTIONS.find((option) => option.value === mode)?.label ?? 'System';
   const initial = user?.email ? user.email.slice(0, 1).toUpperCase() : 'A';

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
               'fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-border bg-card transition-[transform,width] md:sticky md:top-0 md:h-dvh md:translate-x-0',
               collapsed ? 'md:w-16' : 'md:w-64',
               mobileOpen && 'translate-x-0',
            )}
         >
            <div className="flex h-14 items-center gap-2 border-b border-border px-3">
               <a
                  href="/subscribers"
                  className={cn(
                     'inline-flex min-w-0 items-center gap-2 font-heading text-base font-semibold',
                     compact && 'md:mx-auto',
                  )}
                  title="Postwren"
               >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                     <Send
                        className="size-4"
                        aria-hidden="true"
                     />
                  </span>
                  <span className={cn('truncate', compact && 'md:hidden')}>Postwren</span>
               </a>
               <button
                  type="button"
                  className={cn(
                     'ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden',
                  )}
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
               className="flex-1 overflow-y-auto overflow-x-hidden p-2"
            >
               <ul className="grid gap-1">
                  {NAV_ITEMS.map((item) => {
                     const active = isActive(path, item.href);

                     return (
                        <li key={item.href}>
                           <a
                              href={item.href}
                              aria-current={active ? 'page' : undefined}
                              title={compact ? item.label : undefined}
                              onClick={() => setMobileOpen(false)}
                              className={cn(
                                 'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                 active
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                                 compact && 'md:justify-center md:px-0',
                              )}
                           >
                              {item.icon}
                              <span className={cn('truncate', compact && 'md:hidden')}>
                                 {item.label}
                              </span>
                           </a>
                        </li>
                     );
                  })}
               </ul>
            </nav>

            <div
               data-guide="sidebar-footer"
               className="grid gap-1.5 border-t border-border p-2"
            >
               <DropdownMenu className="w-full">
                  <DropdownMenuTrigger
                     aria-label="Account menu"
                     title={compact ? (user?.email ?? 'Account') : undefined}
                     className={cn(
                        'h-auto w-full gap-2 px-2 py-2 text-left',
                        compact &&
                           'md:mx-auto md:flex md:size-9 md:justify-center md:gap-0 md:border-transparent md:bg-transparent md:px-0 md:py-0',
                     )}
                  >
                     <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
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
                     <DropdownMenuItem onSelect={() => void handleSignOut()}>
                        <LogOut aria-hidden="true" />
                        Sign out
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>

               <div className={cn('flex items-center gap-1', compact && 'md:flex-col md:gap-1.5')}>
                  <DropdownMenu className={cn(!compact && 'flex-1')}>
                     <DropdownMenuTrigger
                        aria-label={`Theme: ${themeLabel}`}
                        title="Theme"
                        className={cn(
                           'gap-1.5 px-2 text-xs',
                           compact &&
                              'md:size-9 md:justify-center md:gap-0 md:border-transparent md:bg-transparent md:px-0 md:py-0',
                        )}
                     >
                        {themeIcon}
                        <span className={cn('truncate', compact && 'md:hidden')}>{themeLabel}</span>
                        <ChevronDown
                           className={cn(
                              'size-3 shrink-0 text-muted-foreground',
                              compact && 'md:hidden',
                           )}
                           aria-hidden="true"
                        />
                     </DropdownMenuTrigger>
                     <DropdownMenuContent className="bottom-full left-0 right-auto mb-1">
                        {THEME_OPTIONS.map((option) => (
                           <DropdownMenuItem
                              key={option.value}
                              aria-pressed={mode === option.value}
                              onSelect={() => setMode(option.value)}
                           >
                              {option.icon}
                              {option.label}
                           </DropdownMenuItem>
                        ))}
                     </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                     variant="ghost"
                     size="sm"
                     className={cn(
                        'shrink-0 gap-1.5 px-2',
                        compact && 'md:size-9 md:justify-center md:gap-0 md:px-0',
                     )}
                     aria-label="Open the guided tour"
                     title="Guide"
                     onClick={openGuide}
                  >
                     <Sparkles aria-hidden="true" />
                     <span className={cn('text-xs', compact && 'md:hidden')}>Guide</span>
                  </Button>

                  <Button
                     variant="ghost"
                     size="icon"
                     className="hidden shrink-0 md:inline-flex"
                     aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                     title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                     aria-pressed={collapsed}
                     onClick={() => setCollapsed((value) => !value)}
                  >
                     {collapsed ? (
                        <PanelLeftOpen aria-hidden="true" />
                     ) : (
                        <PanelLeftClose aria-hidden="true" />
                     )}
                  </Button>
               </div>
            </div>
         </aside>

         <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
               <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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

               <p className="min-w-0 flex-1 truncate text-sm font-medium">{pageTitle}</p>
            </header>

            <main
               id="main-content"
               tabIndex={-1}
               className="w-full max-w-[2000px] flex-1 px-4 py-4 outline-none sm:px-6 sm:py-6 lg:px-8 lg:py-8"
            >
               {children}
            </main>
         </div>
      </div>
   );
}
