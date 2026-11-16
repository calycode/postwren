import type { ComponentChildren } from 'preact';
import { Route, Router, useLocation } from 'preact-iso';
import { AppShell } from './components/app-shell';
import { RequireAuth } from './components/require-auth';
import { GuideProvider } from './lib/guide';
import { CampaignDetail } from './routes/campaign-detail';
import { Campaigns } from './routes/campaigns';
import { AutomationDetail } from './routes/automation-detail';
import { Automations } from './routes/automations';
import { Home } from './routes/home';
import { Login } from './routes/login';
import { NotFound } from './routes/not-found';
import { Settings } from './routes/settings';
import { Subscribers } from './routes/subscribers';
import { Tags } from './routes/tags';
import { TemplateDetail } from './routes/template-detail';
import { Templates } from './routes/templates';

/**
 * Mounts the rail and header once, around the router, so navigating swaps only
 * the routed page. Building the shell per route tore it down on every click,
 * which replayed the page fade and made in-app navigation look like a reload.
 * The sign-in screen owns the viewport and renders without any chrome.
 */
function AppLayout({ children }: { children: ComponentChildren }) {
   const { path } = useLocation();

   if (path === '/login') return <>{children}</>;

   return (
      <RequireAuth>
         <AppShell>{children}</AppShell>
      </RequireAuth>
   );
}

export function App() {
   return (
      <GuideProvider>
         <AppLayout>
            <Router>
               <Route
                  path="/login"
                  component={Login}
               />
               <Route
                  path="/"
                  component={Home}
               />
               <Route
                  path="/subscribers"
                  component={Subscribers}
               />
               <Route
                  path="/tags"
                  component={Tags}
               />
               <Route
                  path="/templates"
                  component={Templates}
               />
               <Route
                  path="/templates/:id"
                  component={TemplateDetail}
               />
               <Route
                  path="/campaigns"
                  component={Campaigns}
               />
               <Route
                  path="/campaigns/:id"
                  component={CampaignDetail}
               />
               <Route
                  path="/automations"
                  component={Automations}
               />
               <Route
                  path="/automations/:id"
                  component={AutomationDetail}
               />
               <Route
                  path="/settings"
                  component={Settings}
               />
               <Route
                  default
                  component={NotFound}
               />
            </Router>
         </AppLayout>
      </GuideProvider>
   );
}
