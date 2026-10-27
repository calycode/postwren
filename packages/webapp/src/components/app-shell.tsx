import type { ComponentChildren } from 'preact';
import { useState } from 'react';
import { useLocation } from 'preact-iso';
import {
   ChevronDown,
   FileText,
   LogOut,
   Menu,
   Monitor,
   Moon,
   Send,
   Settings,
   Sun,
   Tag,
   Users,
   X,
} from 'lucide-react';
import {
   cn,
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@mailer/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import type { ThemeMode } from '@/lib/theme';

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

export function AppShell({ children }: { children: ComponentChildren }) {
   const { path, route } = useLocation();
   const { user, signOut } = useAuth();
   const { mode, resolved, setMode } = useTheme();
   const [mobileOpen, setMobileOpen] = useState(false);

   const activeItem = NAV_ITEMS.find((item) => isActive(path, item.href));
   const pageTitle = activeItem?.label ?? 'Mailer';
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
               'fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-border bg-card transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0',
               mobileOpen && 'translate-x-0',
            )}
         >
            <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
               <a
                  href="/subscribers"
                  className="inline-flex items-center gap-2 font-heading text-base font-semibold"
               >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                     <Send
                        className="size-4"
                        aria-hidden="true"
                     />
                  </span>
                  Mailer
               </a>
               <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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
               className="flex-1 overflow-y-auto p-3"
            >
               <ul className="grid gap-1">
                  {NAV_ITEMS.map((item) => (
                     <li key={item.href}>
                        <a
                           href={item.href}
                           aria-current={isActive(path, item.href) ? 'page' : undefined}
                           onClick={() => setMobileOpen(false)}
                           className={cn(
                              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                              isActive(path, item.href)
                                 ? 'bg-accent text-accent-foreground'
                                 : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                           )}
                        >
                           {item.icon}
                           {item.label}
                        </a>
                     </li>
                  ))}
               </ul>
            </nav>

            <div className="border-t border-border p-3">
               <p className="truncate px-3 text-xs text-muted-foreground">
                  {user?.email ?? 'Signed in'}
               </p>
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

               <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Theme: ${mode}`}>
                     {themeIcon}
                     <span className="hidden sm:inline">
                        {THEME_OPTIONS.find((option) => option.value === mode)?.label}
                     </span>
                     <ChevronDown
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                     />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                     {THEME_OPTIONS.map((option) => (
                        <DropdownMenuItem
                           key={option.value}
                           aria-pressed={mode === option.value}
                           onClick={() => setMode(option.value)}
                        >
                           {option.icon}
                           {option.label}
                        </DropdownMenuItem>
                     ))}
                  </DropdownMenuContent>
               </DropdownMenu>

               <DropdownMenu>
                  <DropdownMenuTrigger aria-label="Account menu">
                     <span className="hidden max-w-40 truncate sm:inline">
                        {user?.email ?? 'Account'}
                     </span>
                     <span className="sm:hidden">
                        {user?.email ? user.email.slice(0, 1).toUpperCase() : 'A'}
                     </span>
                     <ChevronDown
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                     />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                     <div className="px-2 py-1.5">
                        <p className="text-xs text-muted-foreground">Signed in as</p>
                        <p className="max-w-56 truncate text-sm font-medium">
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
