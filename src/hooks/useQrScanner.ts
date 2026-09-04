import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'denied'
  | 'unsupported'
  | 'error';

interface UseQrScannerOptions {
  enabled: boolean;
  onDetect: (value: string) => void;
}

interface UseQrScannerResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: ScannerStatus;
  error: string | null;
  /** True when the device exposes a torch on the active camera. */
  torchAvailable: boolean;
  torchOn: boolean;
  toggleTorch: () => Promise<void>;
  retry: () => void;
}

const SCAN_INTERVAL_MS = 250;

/** Chrome/Edge/Android expose BarcodeDetector; Safari and Firefox do not. */
function detectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Live QR scanning from the rear camera.
 *
 * Uses the native BarcodeDetector so nothing extra ships in the bundle. Where
 * it is missing (Safari, Firefox), `status` is `unsupported` and the caller is
 * expected to offer manual entry rather than blocking the delivery.
 */
export function useQrScanner({ enabled, onDetect }: UseQrScannerOptions): UseQrScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  // Held in a ref so a re-render of the caller cannot restart the camera.
  const onDetectRef = useRef(onDetect);

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Releasing every track is what actually turns the camera light off.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      setStatus('idle');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setError('This browser cannot access the camera.');
      return;
    }
    if (!detectorSupported()) {
      setStatus('unsupported');
      setError('This browser cannot scan QR codes. Enter the order number instead.');
      return;
    }

    let cancelled = false;
    setStatus('starting');
    setError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // iOS refuses to autoplay inline video without these two flags.
          video.setAttribute('playsinline', 'true');
          video.muted = true;
          await video.play().catch(() => undefined);
        }

        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorchAvailable(Boolean(caps.torch));

        const Detector = (window as any).BarcodeDetector;
        detectorRef.current = new Detector({ formats: ['qr_code'] });

        setStatus('scanning');

        timerRef.current = window.setInterval(async () => {
          const el = videoRef.current;
          if (!el || el.readyState < 2 || !detectorRef.current) return;
          try {
            const codes = await detectorRef.current.detect(el);
            const value = codes?.[0]?.rawValue;
            if (value) onDetectRef.current(String(value));
          } catch {
            /* transient decode failures are normal between frames */
          }
        }, SCAN_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        const name = (err as DOMException)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied');
          setError('Camera permission is blocked. Allow it, or enter the order number.');
        } else if (name === 'NotFoundError') {
          setStatus('error');
          setError('No camera found on this device.');
        } else {
          setStatus('error');
          setError('Could not start the camera.');
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, nonce, stop]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      // `torch` is real on Android Chrome but missing from lib.dom's types.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  return { videoRef, status, error, torchAvailable, torchOn, toggleTorch, retry };
}
