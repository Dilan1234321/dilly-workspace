"use client";

import { useEffect, useRef } from "react";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const FACE_R = (96 * 0.44) / 2;
const TRAVEL = 14;
const CX = 48;
const CY = 48;

export type DillyEmotion = "scanning" | "thinking" | "focused" | "happy";

const EMOTION: Record<
  DillyEmotion,
  { smile: number; squint: number; eyeWidth: number; pupilSize: number }
> = {
  scanning: { smile: 0.18, squint: 0, eyeWidth: 1.0, pupilSize: 1.0 },
  thinking: { smile: 0.08, squint: 0.28, eyeWidth: 0.86, pupilSize: 0.92 },
  focused: { smile: 0.05, squint: 0.48, eyeWidth: 0.8, pupilSize: 1.1 },
  happy: { smile: 0.36, squint: 0.1, eyeWidth: 1.12, pupilSize: 1.0 },
};

export function DillyOrbScanner({ emotion }: { emotion: DillyEmotion }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const emotionCur = useRef({ ...EMOTION.scanning });
  const tRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const pickTarget = () => {
      const ang = Math.random() * Math.PI * 2;
      const mag = TRAVEL * (0.72 + Math.random() * 0.28);
      targetRef.current = { x: Math.cos(ang) * mag, y: Math.sin(ang) * mag };
    };
    pickTarget();
    const id = window.setInterval(pickTarget, 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      tRef.current += 1 / 60;
      const t = tRef.current;

      const tgt = EMOTION[emotion];
      emotionCur.current.smile = lerp(emotionCur.current.smile, tgt.smile, 0.065);
      emotionCur.current.squint = lerp(emotionCur.current.squint, tgt.squint, 0.065);
      emotionCur.current.eyeWidth = lerp(emotionCur.current.eyeWidth, tgt.eyeWidth, 0.065);
      emotionCur.current.pupilSize = lerp(emotionCur.current.pupilSize, tgt.pupilSize, 0.065);

      velRef.current.x = lerp(
        velRef.current.x,
        (targetRef.current.x - posRef.current.x) * 0.06,
        0.2
      );
      velRef.current.y = lerp(
        velRef.current.y,
        (targetRef.current.y - posRef.current.y) * 0.06,
        0.2
      );
      posRef.current.x += velRef.current.x;
      posRef.current.y += velRef.current.y;

      const sc = FACE_R / 19;
      const { smile, squint, eyeWidth, pupilSize } = emotionCur.current;
      const blinkWave = Math.sin(t * 0.78);
      const blinkVal = blinkWave > 0.963 ? 0.12 : 1;

      ctx.clearRect(0, 0, 96, 96);
      ctx.save();
      ctx.translate(CX + posRef.current.x, CY + posRef.current.y);

      const mw = 4 * sc;
      const smileCurve = smile * 3.5 * sc;
      ctx.strokeStyle = "rgba(201, 168, 76, 0.95)";
      ctx.lineWidth = Math.max(1.1, 1.35 * sc);
      ctx.beginPath();
      ctx.moveTo(-mw, 5 * sc);
      ctx.quadraticCurveTo(0, 5 * sc + smileCurve * 2, mw, 5 * sc);
      ctx.stroke();

      const eyeRx = 5.5 * sc * eyeWidth;
      const eyeRy = 3 * sc * (1 - squint * 0.5) * blinkVal;
      const gold = "rgba(201, 168, 76, 0.92)";

      const drawEye = (sx: number) => {
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.ellipse(sx, -3 * sc, eyeRx, eyeRy, 0, 0, Math.PI * 2);
        ctx.fill();

        const speed = Math.hypot(velRef.current.x, velRef.current.y);
        const dir =
          speed > 0.01
            ? Math.atan2(velRef.current.y, velRef.current.x)
            : 0;
        const maxOff = eyeRx * 0.45;
        const px = Math.cos(dir) * Math.min(maxOff, speed * 8) * 0.35;
        const py = Math.sin(dir) * Math.min(eyeRy * 0.5, speed * 6) * 0.35;
        ctx.fillStyle = "rgba(10, 10, 11, 0.88)";
        ctx.beginPath();
        ctx.arc(sx + px, -3 * sc + py, 1.1 * sc * pupilSize, 0, Math.PI * 2);
        ctx.fill();
      };

      drawEye(-5.5 * sc);
      drawEye(5.5 * sc);

      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [emotion]);

  return (
    <div className="relative mx-auto mb-[22px] h-[130px] w-[130px]">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
          style={{
            transform: "translate(-50%, -50%)",
            animation: `onboarding-ripple 2.4s ease-out infinite ${i * 0.8}s`,
          }}
        />
      ))}
      <div
        className="absolute left-1/2 top-1/2 flex h-[108px] w-[108px] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full"
        style={{
          background: "var(--golddim)",
          border: "1.5px solid var(--goldbdr)",
        }}
      >
        <canvas ref={canvasRef} width={96} height={96} className="block" aria-hidden />
      </div>
    </div>
  );
}
