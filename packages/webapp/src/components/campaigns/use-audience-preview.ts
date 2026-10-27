import { useEffect, useState } from 'react';
import { audiencePreview } from '@/lib/api/campaigns';
import { errorMessage } from '@/lib/form-errors';
import { useDebouncedValue } from '@/lib/hooks';

export type AudiencePreviewState = {
   count: number | null;
   loading: boolean;
   error: string | null;
};

const IDLE: AudiencePreviewState = { count: null, loading: false, error: null };

export function useAudiencePreview(query: string, enabled = true): AudiencePreviewState {
   const debouncedQuery = useDebouncedValue(query, 400);
   const [state, setState] = useState<AudiencePreviewState>(IDLE);

   useEffect(() => {
      if (!enabled) {
         setState(IDLE);
         return;
      }

      let cancelled = false;
      setState((current) => ({ count: current.count, loading: true, error: null }));

      audiencePreview(debouncedQuery)
         .then((result) => {
            if (!cancelled) setState({ count: result.count, loading: false, error: null });
         })
         .catch((cause: unknown) => {
            if (!cancelled) {
               setState({
                  count: null,
                  loading: false,
                  error: errorMessage(cause, 'Could not check this audience'),
               });
            }
         });

      return () => {
         cancelled = true;
      };
   }, [debouncedQuery, enabled]);

   if (!enabled) return IDLE;

   return {
      ...state,
      loading: state.loading || query !== debouncedQuery,
   };
}
