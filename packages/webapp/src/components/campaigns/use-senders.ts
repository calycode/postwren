import { useCallback, useEffect, useState } from 'react';
import { listSenders } from '@/lib/api/settings';
import type { SenderSettings } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';

export type SendersState = {
   loading: boolean;
   error: string | null;
   settings: SenderSettings | null;
   reload: () => void;
};

export function useSenders(active = true): SendersState {
   const [loading, setLoading] = useState(active);
   const [error, setError] = useState<string | null>(null);
   const [settings, setSettings] = useState<SenderSettings | null>(null);
   const [nonce, setNonce] = useState(0);

   const reload = useCallback(() => setNonce((value) => value + 1), []);

   useEffect(() => {
      if (!active) return;

      let cancelled = false;
      setLoading(true);
      setError(null);

      listSenders()
         .then((result) => {
            if (!cancelled) setSettings(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load sending addresses'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [active, nonce]);

   return { loading, error, settings, reload };
}

export function defaultSender(settings: SenderSettings | null) {
   if (settings === null) return undefined;
   return (
      settings.addresses.find((address) => address.is_default === 1) ??
      settings.addresses.find((address) => address.verified_at !== null)
   );
}
