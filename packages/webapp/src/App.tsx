import type { ComponentType } from 'preact';
import { Route, Router } from 'preact-iso';
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

function guarded(Component: ComponentType) {
   return function GuardedPage() {
      return (
         <RequireAuth>
            <AppShell>
               <Component />
            </AppShell>
         </RequireAuth>
      );
   };
}

export function App() {
   return (
      <GuideProvider>
         <Router>
            <Route
               path="/login"
               component={Login}
            />
            <Route
               path="/"
               component={guarded(Home)}
            />
            <Route
               path="/subscribers"
               component={guarded(Subscribers)}
            />
            <Route
               path="/tags"
               component={guarded(Tags)}
            />
            <Route
               path="/templates"
               component={guarded(Templates)}
            />
            <Route
               path="/templates/:id"
               component={guarded(TemplateDetail)}
            />
            <Route
               path="/campaigns"
               component={guarded(Campaigns)}
            />
            <Route
               path="/campaigns/:id"
               component={guarded(CampaignDetail)}
            />
            <Route
               path="/automations"
               component={guarded(Automations)}
            />
            <Route
               path="/automations/:id"
               component={guarded(AutomationDetail)}
            />
            <Route
               path="/settings"
               component={guarded(Settings)}
            />
            <Route
               default
               component={NotFound}
            />
         </Router>
      </GuideProvider>
   );
}
