"use client";

import React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface LoaderOneProps {
  /** Dot color - use theme.primary for Dilly brand */
  color?: string;
  /** Dot size in pixels */
  size?: number;
  className?: string;
}

const LoaderOne = React.forwardRef<HTMLDivElement, LoaderOneProps>(
  ({ color = "#3b82f6", size = 12, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-center gap-1", className)}
        role="status"
        aria-label="Loading"
      >
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
            }}
            initial={{ x: 0 }}
            animate={{
              x: [0, size * 0.8, 0],
              opacity: [0.5, 1, 0.5],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    );
  }
);

LoaderOne.displayName = "LoaderOne";

export { LoaderOne };
