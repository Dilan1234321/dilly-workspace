"use client";

import { useState, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const size = Math.min(pixelCrop.width, pixelCrop.height);
  canvas.width = size;
  canvas.height = size;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create blob"))),
      "image/jpeg",
      0.92
    );
  });
}

type ProfilePhotoCropProps = {
  imageSrc: string;
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
};

export function ProfilePhotoCrop({ imageSrc, onComplete, onCancel }: ProfilePhotoCropProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onComplete(blob);
    } catch (e) {
      console.error("Crop failed:", e);
    } finally {
      setSaving(false);
    }
  }, [imageSrc, croppedAreaPixels, onComplete]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 backdrop-blur-sm" aria-modal="true">
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <h2 className="text-lg font-semibold text-slate-100">Crop Profile Photo</h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} className="border-slate-600 text-slate-300">
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || !croppedAreaPixels}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          minZoom={0.5}
          maxZoom={4}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { backgroundColor: "transparent" },
            cropAreaStyle: { border: "2px solid rgba(255,255,255,0.6)" },
          }}
        />
      </div>

      <div className="p-4 border-t border-[var(--dilly-border)] bg-[var(--dilly-bg)]/95">
        <div className="max-w-[375px] mx-auto space-y-3">
          {/* Preset zoom buttons */}
          <div className="flex flex-wrap gap-2 justify-center">
            {([0.5, 1, 1.5, 2, 2.5, 3, 4] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setZoom(level)}
                className={`min-h-[36px] min-w-[36px] px-2.5 rounded-lg text-xs font-medium transition-colors ${
                  Math.abs(zoom - level) < 0.05
                    ? "bg-[var(--dilly-primary)] text-white"
                    : "border border-slate-600 text-slate-300 hover:bg-slate-700/50"
                }`}
                aria-label={`Zoom ${level}x`}
              >
                {level}x
              </button>
            ))}
          </div>
          {/* Slider + fine control */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              className="shrink-0 h-9 w-9 p-0 rounded-lg border-slate-600 text-slate-300 min-h-[44px] min-w-[44px]"
              aria-label="Zoom out"
            >
              −
            </Button>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-3 rounded-lg appearance-none cursor-pointer accent-[var(--dilly-primary)]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.min(4, z + 0.1))}
              className="shrink-0 h-9 w-9 p-0 rounded-lg border-slate-600 text-slate-300 min-h-[44px] min-w-[44px]"
              aria-label="Zoom in"
            >
              +
            </Button>
            <span className="text-xs text-slate-500 tabular-nums w-12 shrink-0">{Math.round(zoom * 100)}%</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2 text-center">Drag to reposition · Presets or slider to zoom</p>
      </div>
    </div>
  );
}
