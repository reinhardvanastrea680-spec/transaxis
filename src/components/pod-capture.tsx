"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, MapPin, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { beginPodCapture, confirmPodUpload } from "@/app/dispatch/pod-actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Delivery photos are evidence, so they are compressed before upload. A modern
 * phone camera produces 3–5 MB per shot; at ~300 KB the driver can upload on a
 * weak mobile connection without burning their data bundle.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const GEO_TIMEOUT_MS = 6000;

type Stage = "idle" | "preview" | "uploading" | "done";

type Coords = { lat: number; lng: number };

async function compressPhoto(file: File): Promise<Blob> {
  // createImageBitmap fails on some HEIC/HEIF files; fall back to the original
  // rather than blocking the driver at the customer's gate.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );

  return blob ?? file;
}

function readCoords(): Promise<Coords | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

type Props = {
  open: boolean;
  dispatchId: string | null;
  /** Null means photos are kept permanently. */
  retentionDays: number | null;
  onClose: () => void;
  onSaved: () => void;
};

export function PodCapture({
  open,
  dispatchId,
  retentionDays,
  onClose,
  onSaved,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStage("idle");
    setError(null);
    setBlob(null);
    setFileName(null);
    setCoords(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // Clear the object URL when the modal closes so the blob can be collected.
  useEffect(() => {
    if (open) return;
    reset();
  }, [open, reset]);

  const handlePick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);

    try {
      const compressed = await compressPhoto(file);
      const url = URL.createObjectURL(compressed);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setBlob(compressed);
      setStage("preview");

      // Ask for the location in parallel; a refusal must never block delivery.
      void readCoords().then(setCoords);
    } catch {
      setError("Could not read that photo. Try taking it again.");
      setStage("idle");
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!blob || !dispatchId) return;
    setError(null);
    setStage("uploading");

    const begun = await beginPodCapture(dispatchId);
    if (!begun?.success || !begun.path) {
      setError(begun?.error ?? "Could not start the upload.");
      setStage("preview");
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(begun.bucket ?? "pod")
      .upload(begun.path, blob, { contentType: "image/jpeg", upsert: false });

    if (uploadError) {
      setError(
        uploadError.message.toLowerCase().includes("fetch")
          ? "Upload failed — check your connection and try again."
          : uploadError.message,
      );
      setStage("preview");
      return;
    }

    const confirmed = await confirmPodUpload({
      dispatchId,
      path: begun.path,
      capturedAt: new Date().toISOString(),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });

    if (confirmed?.error) {
      setError(confirmed.error);
      setStage("preview");
      return;
    }

    setStage("done");
    onSaved();
  }, [blob, dispatchId, coords, onSaved]);

  const busy = stage === "uploading";

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Proof of delivery">
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handlePick(e.target.files?.[0])}
        />

        {stage === "idle" && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong bg-sunken/50 px-6 py-12 text-center transition-colors hover:border-brand hover:bg-brand-soft/40"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-brand text-white">
              <Camera size={22} aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-ink">Take a photo</span>
            <span className="max-w-[16rem] text-xs text-ink-muted">
              Photograph the parcel with the customer, or at their gate.
            </span>
          </button>
        )}

        {(stage === "preview" || stage === "uploading" || stage === "done") &&
          preview && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Delivery photo preview"
                className="w-full rounded-card border border-line object-cover"
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                {fileName && (
                  <span className="flex items-center gap-1.5">
                    <ImagePlus size={12} aria-hidden="true" />
                    {fileName}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <MapPin size={12} aria-hidden="true" />
                  {coords
                    ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                    : "Location unavailable"}
                </span>
              </div>
            </div>
          )}

        {stage === "done" && (
          <div className="flex items-center gap-3 rounded-control bg-success-soft px-4 py-3">
            <CheckCircle2
              size={18}
              className="shrink-0 text-success"
              aria-hidden="true"
            />
            <p className="text-sm text-ink">
              Photo saved. The delivery is now waiting for the office to confirm
              it.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {retentionDays !== null && stage !== "done" && (
          <p className="text-xs text-ink-faint">
            Photos are kept for {retentionDays} days on your current plan.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {stage === "done" ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              {stage === "preview" && (
                <Button
                  variant="outline"
                  onClick={reset}
                  disabled={busy}
                  aria-label="Retake photo"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Retake
                </Button>
              )}
              {stage === "preview" && (
                <Button onClick={() => void handleUpload()} loading={busy}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Send delivery proof
                </Button>
              )}
              {stage === "uploading" && (
                <Button loading disabled>
                  Uploading…
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
