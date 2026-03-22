"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const animations = {
  icon: {
    initial: { scale: 1, rotate: 0 },
    tapActive: { scale: 0.85, rotate: -10 },
    tapCompleted: { scale: 1, rotate: 0 },
  },
  burst: {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: [0, 1.4, 1], opacity: [0, 0.4, 0] },
    transition: { duration: 0.7, ease: "easeOut" as const },
  },
  particles: (index: number) => {
    const angle = (index / 5) * (2 * Math.PI);
    const radius = 20;
    const scale = 1;
    const duration = 0.65;

    return {
      initial: { scale: 0, opacity: 0.3, x: 0, y: 0 },
      animate: {
        scale: [0, scale, 0],
        opacity: [0.3, 0.8, 0],
        x: [0, Math.cos(angle) * radius],
        y: [0, Math.sin(angle) * radius * 0.75],
      },
      transition: { duration, delay: index * 0.04, ease: "easeOut" as const },
    };
  },
};

export interface BookmarkIconButtonProps {
  isSaved?: boolean;
  onToggle?: () => void;
  /** Color variant: "red" (default), "blue", or "gold" */
  variant?: "red" | "blue" | "gold";
  className?: string;
  "aria-label"?: string;
}

const COLOR_MAP = {
  red: {
    fill: "text-red-500 fill-red-500",
    burst: "radial-gradient(circle, rgba(239,68,68,0.4) 0%, rgba(239,68,68,0) 80%)",
    particle: "bg-red-500",
  },
  blue: {
    fill: "text-blue-500 fill-blue-500",
    burst: "radial-gradient(circle, rgba(59,130,246,0.4) 0%, rgba(59,130,246,0) 80%)",
    particle: "bg-blue-500",
  },
  gold: {
    fill: "text-[#fdb913] fill-[#fdb913]",
    burst: "radial-gradient(circle, rgba(253,185,19,0.4) 0%, rgba(253,185,19,0) 80%)",
    particle: "bg-[#fdb913]",
  },
};

export function BookmarkIconButton({
  isSaved = false,
  onToggle,
  variant = "red",
  className,
  "aria-label": ariaLabel,
}: BookmarkIconButtonProps) {
  const colors = COLOR_MAP[variant];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle?.();
  };

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        aria-pressed={isSaved}
        aria-label={ariaLabel ?? (isSaved ? "Remove bookmark" : "Bookmark")}
        className="size-8 shrink-0"
      >
        <motion.div
          initial={{ scale: 1 }}
          animate={{ scale: isSaved ? 1.1 : 1 }}
          whileTap={
            isSaved ? animations.icon.tapCompleted : animations.icon.tapActive
          }
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="relative flex items-center justify-center"
        >
          <Bookmark className="opacity-60" size={16} aria-hidden="true" />

          <Bookmark
            className={cn("absolute inset-0 transition-all duration-300", colors.fill)}
            size={16}
            aria-hidden="true"
            style={{ opacity: isSaved ? 1 : 0 }}
          />

          <AnimatePresence>
            {isSaved && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: colors.burst,
                }}
                {...animations.burst}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </Button>

      <AnimatePresence>
        {isSaved && (
          <motion.div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className={cn("absolute rounded-full", colors.particle)}
                style={{
                  width: "5px",
                  height: "5px",
                  filter: "blur(1px)",
                  transform: "translate(-50%, -50%)",
                }}
                initial={animations.particles(i).initial}
                animate={animations.particles(i).animate}
                transition={animations.particles(i).transition}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
