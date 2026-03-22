/**
 * Minimal geometric Dilly face on canvas — pure logic, no React.
 * `start(canvas, size)` runs rAF loop; returns cleanup to stop.
 */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function start(canvas: HTMLCanvasElement, size: number): () => void {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) {
    return () => {};
  }
  const ctx = maybeCtx;

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = size / 2;
  const cy = size / 2;
  const faceRadius = (size * 0.44) / 2;
  const scale = faceRadius / 19;
  const travelR = size * 0.15;

  let pos = { x: 0, y: 0 };
  let vel = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let smile = 0.35;
  let smileTarget = 0.35;

  let raf = 0;
  let lastTargetPick = performance.now();
  let lastSmilePick = performance.now();

  function pickTarget(now: number) {
    const ang = Math.random() * Math.PI * 2;
    const dist = travelR * (0.7 + Math.random() * 0.3);
    target = { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist };
    lastTargetPick = now;
  }

  function pickSmile(now: number) {
    smileTarget = 0.15 + Math.random() * 0.45;
    lastSmilePick = now;
  }

  const gold = "#C9A84C";

  function frame() {
    const t = performance.now();
    if (t - lastTargetPick >= 2600) pickTarget(t);
    if (t - lastSmilePick >= 2200) pickSmile(t);

    vel.x = lerp(vel.x, (target.x - pos.x) * 0.06, 0.2);
    vel.y = lerp(vel.y, (target.y - pos.y) * 0.06, 0.2);
    pos.x += vel.x;
    pos.y += vel.y;
    smile = lerp(smile, smileTarget, 0.04);

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(cx + pos.x, cy + pos.y);

    const curve = smile * 4.5 * scale;
    const eyeR = 2.8 * scale;
    const lineW = 2.2 * scale;

    ctx.beginPath();
    ctx.arc(-8 * scale, -4 * scale, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = gold;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(8 * scale, -4 * scale, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = gold;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-8 * scale, 5 * scale);
    ctx.quadraticCurveTo(0, 5 * scale + curve, 8 * scale, 5 * scale);
    ctx.strokeStyle = gold;
    ctx.lineWidth = lineW;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.restore();

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
  };
}
