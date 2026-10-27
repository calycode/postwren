import { render } from 'preact';
import { LocationProvider } from 'preact-iso';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import './styles/globals.css';

const root = document.getElementById('app');
if (!root) throw new Error('Root element #app not found');

render(
   <ThemeProvider>
      <AuthProvider>
         <LocationProvider>
            <App />
         </LocationProvider>
      </AuthProvider>
   </ThemeProvider>,
   root,
);
