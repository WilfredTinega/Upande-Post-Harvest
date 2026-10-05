import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, fontFamily, fontSize, spacing } from '@/src/theme';
import { Button } from './Button';

// One-shot callback bridge from CameraScannerScreen back to the originating
// field. Set by the caller right before navigating to /camera-scanner; the
// scanner invokes + clears it on a successful read.
let cameraResultCallback: ((code: string) => void) | null = null;
export function setCameraResultCallback(cb: ((code: string) => void) | null) {
  cameraResultCallback = cb;
}
export function consumeCameraResult(code: string) {
  const cb = cameraResultCallback;
  cameraResultCallback = null;
  if (cb) cb(code);
}

export function CameraScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [, setBusy] = useState(false);
  const handled = useRef(false);

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <View style={[styles.black, styles.center]}>
        <Text style={styles.permissionText}>Camera access is required to scan.</Text>
        <Button label="Grant access" onPress={() => requestPermission()} />
        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const onBarcode = (data: string) => {
    if (handled.current) return;
    handled.current = true;
    setBusy(true);
    consumeCameraResult(data);
    router.back();
  };

  return (
    <View style={styles.black}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'upc_a', 'upc_e', 'pdf417', 'datamatrix'],
        }}
        onBarcodeScanned={({ data }) => onBarcode(data)}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Align the QR inside the frame</Text>
      </View>
      <Pressable onPress={() => router.back()} style={styles.closeBtn}>
        <Ionicons name="close" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const FRAME_W = 280;
const FRAME_H = 280;

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderColor: '#FFFFFF',
    borderWidth: 2,
    borderRadius: borderRadius.md,
  },
  hint: {
    color: '#FFFFFF',
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 44, height: 44,
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  permissionText: {
    color: colors.textOnPrimary,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  linkBtn: { padding: spacing.sm },
  link: {
    color: colors.textOnPrimary,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
});
