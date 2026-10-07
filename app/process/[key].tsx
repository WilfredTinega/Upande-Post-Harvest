import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ProcessPage } from '@/src/components/ProcessPage';
import { PROCESSES, isProcessKey } from '@/src/scan/processes';

/** A process's page, opened from the menu. */
export default function ProcessScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const process = PROCESSES.find((p) => p.key === key);

  useEffect(() => {
    if (!isProcessKey(key)) router.back();
  }, [key, router]);

  return process ? <ProcessPage process={process} /> : null;
}
