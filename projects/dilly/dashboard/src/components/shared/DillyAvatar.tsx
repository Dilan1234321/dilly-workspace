"use client";

import { useEffect, useRef } from "react";
import { start } from "./DillyFaceEngine";

type DillyAvatarProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
};

/**
 * Canvas Dilly face — shared engine for launch, chat, home, etc.
 */
export function DillyAvatar({ size = 90, className, style, ...rest }: DillyAvatarProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return start(el, size);
  }, [size]);

  return <canvas ref={ref} width={size} height={size} className={className} style={style} {...rest} />;
}
