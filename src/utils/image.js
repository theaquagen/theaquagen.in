// src/utils/image.js
export async function resizeImageToBlob(file, maxW = 256, maxH = 256, type = "image/jpeg", quality = 0.8) {
  const img = await fileToImage(file);
  const { canvas, ctx } = createCanvasFor(img, maxW, maxH);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
  // Fallback for older browsers if blob is null:
  if (!blob) {
    const dataUrl = canvas.toDataURL(type, quality);
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }
  return blob;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function createCanvasFor(img, maxW, maxH) {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return { canvas, ctx };
}