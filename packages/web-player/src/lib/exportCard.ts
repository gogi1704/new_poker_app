interface CardData {
  clubName: string;
  memberLevel: string;
  nickname: string;
  cardId: string;
}

/**
 * Draws the membership card to an offscreen canvas and triggers a PNG
 * download. No image/DOM-to-canvas library needed — the card is simple
 * enough to draw directly, which also keeps this dependency-free.
 */
export function exportMembershipCard(data: CardData) {
  const width = 900;
  const height = 560;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#2a2412");
  bg.addColorStop(1, "#15130a");
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, width, height, 28);
  ctx.fill();

  ctx.strokeStyle = "#e8b23d";
  ctx.lineWidth = 3;
  roundRect(ctx, 8, 8, width - 16, height - 16, 24);
  ctx.stroke();

  ctx.fillStyle = "#9aa0ab";
  ctx.font = "600 22px sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("УРОВЕНЬ УЧАСТНИКА", 48, 70);

  ctx.fillStyle = "#f2f3f5";
  ctx.font = "800 44px sans-serif";
  ctx.letterSpacing = "0px";
  ctx.fillText(data.memberLevel, 48, 128);

  ctx.font = "56px sans-serif";
  ctx.fillText("🏛", width - 130, 100);

  ctx.strokeStyle = "rgba(232,178,61,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, 320);
  ctx.lineTo(width - 48, 320);
  ctx.stroke();

  ctx.fillStyle = "#9aa0ab";
  ctx.font = "600 18px sans-serif";
  ctx.fillText(data.clubName.toUpperCase(), 48, 390);

  ctx.fillStyle = "#f2f3f5";
  ctx.font = "800 36px sans-serif";
  ctx.fillText(data.nickname, 48, 440);

  ctx.fillStyle = "#9aa0ab";
  ctx.font = "16px monospace";
  ctx.textAlign = "right";
  ctx.fillText(`КАРТА ${data.cardId.slice(0, 8).toUpperCase()}`, width - 48, 500);
  ctx.textAlign = "left";

  const link = document.createElement("a");
  link.download = `card-${data.nickname}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
