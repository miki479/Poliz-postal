/** Ridimensiona un'immagine a un quadrato JPEG leggero (max ~30 KB) senza librerie. */
export async function resizeToSquareDataUrl(file: File, size = 256, maxChars = 100_000): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Usa un\'immagine JPG, PNG o WebP.');
  if (file.size > 8_000_000) throw new Error('Immagine troppo grande (max 8 MB).');
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Il browser non supporta l\'elaborazione immagini.');
  const side = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close?.();
  let q = 0.8;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > maxChars && q > 0.3) {
    q -= 0.15;
    out = canvas.toDataURL('image/jpeg', q);
  }
  return out;
}
