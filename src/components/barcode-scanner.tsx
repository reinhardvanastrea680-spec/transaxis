"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { SCAN_MODES, type ScanMode } from "@/lib/scan";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

type Props = {
  open: boolean;
  mode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  onClose: () => void;
  onScan: (value: string) => void;
};

// Minimal typing for the BarcodeDetector API (not in all TS libs).
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
};

/**
 * Detecting on every animation frame means ~60 full-frame image analyses per
 * second, which heats the phone and drains the battery while someone holds it
 * at a shelf. Four to five attempts a second is indistinguishable to the user.
 */
const SCAN_INTERVAL_MS = 220;

function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow camera access for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Type the SKU manually instead.";
  }
  if (name === "NotReadableError") {
    return "The camera is already in use by another app. Close it and try again.";
  }
  return e instanceof Error ? e.message : "Could not access the camera.";
}

export function BarcodeScanner({
  open,
  mode,
  onModeChange,
  onClose,
  onScan,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Held in refs so a re-render of the parent cannot restart the camera. The
  // effect below depends only on `open` for the same reason.
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setScanning(true);

    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    if (!Detector) {
      setSupported(false);
      setScanning(false);
      return;
    }

    let cancelled = false;
    const detector = new Detector({
      formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "qr_code"],
    });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        let lastAttempt = 0;
        const loop = async (now: number) => {
          if (cancelled || !videoRef.current) return;

          if (now - lastAttempt >= SCAN_INTERVAL_MS) {
            lastAttempt = now;
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes?.[0]?.rawValue;
              if (value) {
                cancelled = true;
                stream.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
                onScanRef.current(value);
                onCloseRef.current();
                return;
              }
            } catch {
              // Per-frame detection failures are expected (blur, motion); the
              // next attempt will pick it up.
            }
          }

          if (!cancelled) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch (e) {
        setError(cameraErrorMessage(e));
        setScanning(false);
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  const activeMode = SCAN_MODES.find((m) => m.id === mode) ?? SCAN_MODES[0];

  return (
    <Modal open={open} onClose={onClose} title="Scan barcode">
      <div className="space-y-4">
        {/* What the scan should do. Changing this never restarts the camera. */}
        <div>
          <div className="grid grid-cols-3 gap-1 rounded-control bg-sunken p-1">
            {SCAN_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => onModeChange(m.id)}
                className={`rounded-[6px] px-2 py-1.5 text-xs font-medium transition-colors ${
                  mode === m.id
                    ? "bg-surface text-ink ring-1 ring-line"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">{activeMode.hint}</p>
        </div>

        {!supported ? (
          <div className="rounded-control border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            Your browser does not support barcode scanning. Use a Chromium-based
            browser on Android, or type the SKU manually.
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-control border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
          >
            {error}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-card border border-line bg-black">
            <video
              ref={videoRef}
              className="aspect-video w-full object-cover"
              playsInline
              muted
            />
            {scanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-0.5 w-3/4 bg-brand/80" />
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-ink-muted">
          Point the camera at a barcode or QR code. Most USB/Bluetooth scanners
          also work by focusing the SKU field and scanning.
        </p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            <X size={14} aria-hidden="true" />
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
