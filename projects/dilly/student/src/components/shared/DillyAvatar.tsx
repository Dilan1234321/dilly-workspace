"use client";

import { useEffect, useRef } from "react";
import { startFaceEngine } from "./DillyFaceEngine";

interface Props {
  size?: number;
}

export default function DillyAvatar({ size = 96 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startFaceEngine(canvas);
  }, []);

  return <canvas ref={canvasRef} width={size} height={size} />;
}
