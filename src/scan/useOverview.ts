import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { HttpError } from '@/src/services/api';
import { scanApi, type Overview } from '@/src/services/scan-api';
import { userMessage } from '@/src/services/user-message';

/** A reason the figures could not be loaded that an operator (or IT) can act on. */
function overviewError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = err instanceof HttpError ? err.status : 0;
  if (/not whitelisted|has no attribute|no module named|failed to get method/i.test(msg) || status === 404) {
    return 'Today’s figures are not available on this server.';
  }
  if (status === 403) return 'Not permitted to read today’s figures.';
  return userMessage(err, 'Could not load today’s figures.');
}

/**
 * Today's figures per process for `farm`. Loads on mount, whenever the screen
 * comes back into view (e.g. after scanning), and on pull-to-refresh. The last
 * figures stay on screen while a refresh is running or if it fails.
 */
export function useOverview(farm: string) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);

  const reload = useCallback(async () => {
    if (!farm) return;
    setLoading(true);
    try {
      const r = await scanApi.overview(farm);
      if (!r || !r.success) throw new Error(r?.error || 'Could not load today’s figures.');
      setOverview(r);
      setError(null);
      setAt(new Date());
    } catch (err) {
      setError(overviewError(err));
    } finally {
      setLoading(false);
    }
  }, [farm]);

  // A new station: drop the old farm's figures.
  const [shownFarm, setShownFarm] = useState(farm);
  if (shownFarm !== farm) {
    setShownFarm(farm);
    setOverview(null);
    setError(null);
  }

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { overview, loading, error, at, reload };
}
