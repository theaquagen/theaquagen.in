export async function createOptimizedImage(file, maxSize = 512, quality = 0.8) {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxSize / Math.max(width, height));
    const canvas = new OffscreenCanvas(
        Math.round(width * scale),
        Math.round(height * scale)
    );
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return blob;
}