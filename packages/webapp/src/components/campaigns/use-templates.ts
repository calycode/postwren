import { useEffect, useState } from 'react';
import { list as listTemplates } from '@/lib/api/templates';
import type { Template } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';

export type TemplateListState = {
   templates: Template[];
   loading: boolean;
   error: string | null;
   reload: () => void;
};

export function useTemplates(active = true): TemplateListState {
   const [templates, setTemplates] = useState<Template[]>([]);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   useEffect(() => {
      if (!active) return;

      let cancelled = false;
      setLoading(true);
      setError(null);

      listTemplates()
         .then((result) => {
            if (!cancelled) setTemplates(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load templates'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [active, reloadKey]);

   return {
      templates,
      loading,
      error,
      reload: () => setReloadKey((key) => key + 1),
   };
}
