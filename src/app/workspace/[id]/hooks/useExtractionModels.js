'use client';

import { useEffect, useState } from 'react';
import { supportsExtractionResolution } from '@/lib/extractionResolution.mjs';

// Keep discovery and default selection out of the sidebar's rendering code.
// The option is scoped to the current project, so a late response cannot
// select a provider for a different document.
export function useExtractionModels(project, onDefaultProvider) {
  const [discovery, setDiscovery] = useState(null);
  const [retryIndex, setRetryIndex] = useState(0);
  const enabled = supportsExtractionResolution(project);
  const current = discovery?.projectId === project?.id ? discovery : null;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    async function discover() {
      // Development route compilation can outlast the first request. Retry a
      // transient failure once; never silently switch a failed lookup to Lyra.
      for (let attempt = 0; attempt < 2 && active; attempt++) {
        try {
          const response = await fetch('/api/extraction-models', {
            cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
          });
          if (!response.ok && response.status !== 404) throw new Error('Model discovery failed');
          const option = response.ok ? await response.json() : null;
          if (!active) return;
          if (option?.enabled && option.configured) onDefaultProvider?.('openai');
          setDiscovery({ projectId: project.id, option });
          return;
        } catch {
          if (active && attempt === 1) setDiscovery({ projectId: project.id, option: null, error: true });
        }
      }
    }
    discover();
    return () => { active = false; controller.abort(); };
  }, [enabled, project?.id, onDefaultProvider, retryIndex]);

  return {
    option: enabled ? current?.option : null,
    loading: enabled && !current,
    error: enabled && !!current?.error,
    retry: () => { setDiscovery(null); setRetryIndex(value => value + 1); },
  };
}
