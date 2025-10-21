// src/components/CropperDialog.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import Button from "./ui/Button";

export default function CropperDialog({
  open,
  src,                 // data URL or object URL
  aspect = 1,          // square avatar
  onCancel,
  onComplete,          // (blob, previewUrl) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setError("");
      setBusy(false);
    }
  }, [open]);

  const onCropComplete = useCallback((_, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const canConfirm = useMemo(() => !!croppedAreaPixels && !busy, [croppedAreaPixels, busy]);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    setError("");
    try {
      const { blob, previewUrl } = await cropFromSource(src, croppedAreaPixels, "image/jpeg", 0.95);
      onComplete?.(blob, previewUrl);
    } catch (e) {
      setError(e?.message || "Failed to crop image");
    } finally {
      setBusy(false);
    }
  }, [croppedAreaPixels, onComplete, src]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[min(92vw,680px)] rounded-2xl bg-white shadow-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Crop your avatar</h2>
          <p className="text-sm text-neutral-500">Drag to reframe. Use the slider to zoom.</p>
        </div>

        <div className="relative h-[55vh] bg-neutral-100">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            showGrid
            restrictPosition
          />
        </div>

        <div className="flex items-center gap-3 p-4 border-t">
          <label className="text-sm">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {error && <div className="px-4 pb-2 text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button onClick={onCancel} className="bg-white text-black border hover:bg-neutral-50">Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {busy ? "Cropping..." : "Crop & Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Helpers **/

function dataURLToImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

async function ensureDataURL(src) {
  if (src.startsWith("data:")) return src;
  // Object URL -> fetch -> dataURL
  const resp = await fetch(src);
  const blob = await resp.blob();
  return await blobToDataURL(blob);
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });
}

async function cropFromSource(src, area, mimeType = "image/jpeg", quality = 0.95) {
  const dataUrl = await ensureDataURL(src);
  const img = await dataURLToImage(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext("2d");

  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height, // source
    0, 0, canvas.width, canvas.height       // dest
  );

  const blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), mimeType, quality)
  );

  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl };
}