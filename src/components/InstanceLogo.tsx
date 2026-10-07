import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { storage, StorageKeys } from '@/src/services/storage';
import { useAuthStore } from '@/src/stores/authStore';
import { useScanStore } from '@/src/stores/scanStore';

/**
 * The signed-in site's own logo, drawn faintly behind the element it sits in
 * (the home greeting). Private files (/private/files/…) need the session
 * cookie, so the image is requested with it. Renders nothing when the site
 * has no logo or it fails to load.
 */
export function InstanceLogo() {
  const logo = useScanStore((s) => s.logo);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const [cookie, setCookie] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // A new logo gets a fresh try.
  const [logoKey, setLogoKey] = useState(`${logo}|${instanceUrl}`);
  if (logoKey !== `${logo}|${instanceUrl}`) {
    setLogoKey(`${logo}|${instanceUrl}`);
    setFailed(false);
  }

  useEffect(() => {
    storage
      .get(StorageKeys.cookie)
      .then(setCookie)
      .catch(() => setCookie(null));
  }, [logo, instanceUrl]);

  if (!logo || !instanceUrl || failed) return null;
  const uri = /^https?:\/\//i.test(logo) ? logo : `${instanceUrl.replace(/\/+$/, '')}/${logo.replace(/^\/+/, '')}`;

  return (
    <View pointerEvents="none" style={s.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        source={{ uri, headers: cookie ? { Cookie: cookie } : undefined }}
        style={s.image}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '55%', height: '140%', opacity: 0.12 },
});
