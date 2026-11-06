import type { ComponentChildren } from 'preact';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError } from './api/client';
import { logout as apiLogout, session as apiSession } from './api/auth';
import type { AuthUser } from './api/types';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

type AuthContextValue = {
   status: AuthStatus;
   user: AuthUser | null;
   refresh: () => Promise<AuthUser | null>;
   signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
   status: 'loading',
   user: null,
   refresh: async () => null,
   signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: ComponentChildren }) {
   const [status, setStatus] = useState<AuthStatus>('loading');
   const [user, setUser] = useState<AuthUser | null>(null);

   const refresh = useCallback(async (): Promise<AuthUser | null> => {
      try {
         const result = await apiSession();
         setUser(result);
         setStatus('signed-in');
         return result;
      } catch (cause) {
         if (cause instanceof ApiError && cause.status === 401) {
            setUser(null);
            setStatus('signed-out');
            return null;
         }
         setUser(null);
         setStatus('signed-out');
         return null;
      }
   }, []);

   const signOut = useCallback(async () => {
      await apiLogout().catch(() => undefined);
      setUser(null);
      setStatus('signed-out');
   }, []);

   useEffect(() => {
      void refresh();
   }, [refresh]);

   return (
      <AuthContext.Provider value={{ status, user, refresh, signOut }}>
         {children}
      </AuthContext.Provider>
   );
}

export function useAuth(): AuthContextValue {
   return useContext(AuthContext);
}
