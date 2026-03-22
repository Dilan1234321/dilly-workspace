// Pure canvas face animation — no React dependency.
// Call startFaceEngine(canvas) and it returns a cleanup function.

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function startFaceEngine(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const W = canvas.width;  // 96
  const H = canvas.height; // 96

  const TRAVEL = 14; // max drift px from center
  const scale  = (W * 0.44 / 2) / 19; // ≈ 1.11 — maps spec coords → canvas px

  let pos    = { x: 0, y: 0 };
  let vel    = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let smile       = 0.3;
  let smileTarget = 0.3;
  let rafId: number;
  let posTimer:   ReturnType<typeof setTimeout>;
  let smileTimer: ReturnType<typeof setTimeout>;

  function pickTarget() {
    const angle = Math.random() * Math.PI * 2;
    const dist  = (0.72 + Math.random() * 0.28) * TRAVEL;
    target = { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
    posTimer = setTimeout(pickTarget, 2600);
  }

  function pickSmile() {
    smileTarget = 0.15 + Math.random() * 0.45;
    smileTimer  = setTimeout(pickSmile, 2200);
  }

  pickTarget();
  pickSmile();

  function draw() {
    // Spring physics
    vel.x = lerp(vel.x, (target.x - pos.x) * 0.06, 0.20);
    vel.y = lerp(vel.y, (target.y - pos.y) * 0.06, 0.20);
    pos.x += vel.x;
    pos.y += vel.y;

    // Smile lerp
    smile = lerp(smile, smileTarget, 0.04);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + pos.x, H / 2 + pos.y);

    // Left eye dot
    ctx.beginPath();
    ctx.arc(-8 * scale, -4 * scale, 2.8 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#C9A84C";
    ctx.fill();

    // Right eye dot
    ctx.beginPath();
    ctx.arc(8 * scale, -4 * scale, 2.8 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#C9A84C";
    ctx.fill();

    // Smile arc
    const curve = smile * 4.5 * scale;
    ctx.beginPath();
    ctx.moveTo(-8 * scale, 5 * scale);
    ctx.quadraticCurveTo(0, 5 * scale + curve * 2, 8 * scale, 5 * scale);
    ctx.strokeStyle = "#C9A84C";
    ctx.lineWidth   = 2.2 * scale;
    ctx.lineCap     = "round";
    ctx.stroke();

    ctx.restore();

    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    clearTimeout(posTimer);
    clearTimeout(smileTimer);
  };
}
