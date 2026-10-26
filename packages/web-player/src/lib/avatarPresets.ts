// 10 preset avatars (emoji on a colored circle) and a photo-upload resizer —
// both end up as the same thing, a small data: URL, so the rest of the app
// never needs to know whether an avatar is a preset or an uploaded photo.
const SIZE = 160;

export const AVATAR_PRESETS: { emoji: string; bg: string }[] = [
  { emoji: "🐯", bg: "#e8762c" },
  { emoji: "🦊", bg: "#c2662a" },
  { emoji: "🐺", bg: "#5c6670" },
  { emoji: "🦁", bg: "#d6a23a" },
  { emoji: "🐸", bg: "#4a9b5e" },
  { emoji: "🐻", bg: "#7a5230" },
  { emoji: "🦉", bg: "#6b4f8a" },
  { emoji: "🐙", bg: "#b84a7a" },
  { emoji: "🐢", bg: "#3f8f7a" },
  { emoji: "🦅", bg: "#3a5a9b" },
];

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function renderPresetAvatar(preset: { emoji: string; bg: string }): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = preset.bg;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${Math.round(SIZE * 0.55)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(preset.emoji, SIZE / 2, SIZE / 2 + SIZE * 0.04);
  return canvasToJpegDataUrl(canvas);
}

/** Reads an uploaded image file, center-crops it square, and downscales it to a small avatar. */
export function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d")!;
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        resolve(canvasToJpegDataUrl(canvas));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
