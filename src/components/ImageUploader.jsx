// src/components/ImageUploader.jsx
import { useState, useRef } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import { createOptimizedImage } from "../utils/image";
import Button from "./ui/Button";
import Input from "./ui/Input";

export default function ImageUploader({ userId, itemId, onChange }) {
  const [uploads, setUploads] = useState([]); // [{id, originalURL, optimizedURL, origPath, optPath, name}]
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const addFiles = async (files) => {
    if (!files?.length) return;
    const toAdd = Array.from(files).slice(0, Math.max(0, 5 - uploads.length));
    if (!toAdd.length) return;
    setBusy(true);
    try {
      const next = [];
      for (let i = 0; i < toAdd.length; i++) {
        const file = toAdd[i];
        const index = uploads.length + next.length;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const origPath = `marketplace/${userId}/${itemId}/original/img${index}.${ext}`;
        const optPath  = `marketplace/${userId}/${itemId}/optimized/img${index}.jpg`;

        await uploadBytes(ref(storage, origPath), file);

        const optimizedBlob = await createOptimizedImage(file, 1024, 0.82);
        await uploadBytes(ref(storage, optPath), optimizedBlob);

        const [originalURL, optimizedURL] = await Promise.all([
          getDownloadURL(ref(storage, origPath)),
          getDownloadURL(ref(storage, optPath)),
        ]);

        next.push({
          id: `${index}`,
          name: file.name,
          originalURL,
          optimizedURL,
          origPath,
          optPath,
        });
      }
      const updated = [...uploads, ...next];
      setUploads(updated);
      onChange?.(updated.map(({ originalURL, optimizedURL }) => ({ originalURL, optimizedURL })));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAt = async (idx) => {
    const u = uploads[idx];
    setBusy(true);
    try {
      await Promise.all([
        deleteObject(ref(storage, u.origPath)).catch(() => {}),
        deleteObject(ref(storage, u.optPath)).catch(() => {}),
      ]);
      const updated = uploads.filter((_, i) => i !== idx);
      setUploads(updated);
      onChange?.(updated.map(({ originalURL, optimizedURL }) => ({ originalURL, optimizedURL })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          Choose images
        </Button>
      </div>
      <p className="text-xs text-neutral-500">Upload up to 5 images. Images are uploaded immediately.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {uploads.map((u, i) => (
          <div key={u.id} className="relative rounded-lg overflow-hidden border bg-white">
            <img src={u.optimizedURL} alt={u.name} className="h-32 w-full object-cover" />
            <div className="p-2 flex items-center justify-between">
              <span className="text-xs truncate">{u.name}</span>
              <Button size="sm" variant="outline" onClick={() => removeAt(i)} disabled={busy}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}