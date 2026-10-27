import type { ComponentType } from 'preact';
import { useEffect } from 'react';
import { Route, Router, useLocation } from 'preact-iso';
import { AppShell } from './components/app-shell';
import { RequireAuth } from './components/require-auth';
import { CampaignDetail } from './routes/campaign-detail';
import { Campaigns } from './routes/campaigns';
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

function HomeRedirect() {
   const { route } = useLocation();

   useEffect(() => {
      route('/subscribers', true);
   }, [route]);

   return null;
}

export function App() {
   return (
      <Router>
         <Route
            path="/login"
            component={Login}
         />
         <Route
            path="/"
            component={HomeRedirect}
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
            path="/settings"
            component={guarded(Settings)}
         />
         <Route
            default
            component={NotFound}
         />
      </Router>
   );
}
