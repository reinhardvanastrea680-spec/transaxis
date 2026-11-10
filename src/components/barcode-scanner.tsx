"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
};

// Minimal typing for the BarcodeDetector API (not in all TS libs).
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
};

export function BarcodeScanner({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [scanning, setScanning] = useState(false);

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
    const detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "qr_code"] });

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
        // Detection loop
        const loop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const value = codes[0].rawValue;
              if (value) {
                cancelled = true;
                stream.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
                onScan(value);
                onClose();
                return;
              }
            }
          } catch {
            // ignore per-frame errors
          }
          if (!cancelled) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not access camera. Check permissions.",
        );
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
  }, [open, onScan, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Scan barcode">
      <div className="space-y-4">
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
          Point the camera at a barcode or QR code. The product will be looked
          up automatically. Most USB/Bluetooth scanners also work by focusing
          the SKU field and scanning.
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
