"use client";

import { motion } from "framer-motion";
import { Heart } from "lucide-react";

interface HeartFavoriteProps {
  isLiked?: boolean;
  onToggle?: () => void;
  /** Compact size for inline use (e.g. message feedback) */
  size?: "default" | "compact";
  className?: string;
}

export function HeartFavorite({
  isLiked = false,
  onToggle,
  size = "default",
  className,
}: HeartFavoriteProps) {
  const iconSize = size === "compact" ? "h-3.5 w-3.5" : "h-8 w-8";
  const padding = size === "compact" ? "p-0.5" : "p-4";

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.9 }}
      className={`rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 ${padding} ${className ?? ""}`}
      title={isLiked ? "Liked" : "Like"}
      aria-label={isLiked ? "Unlike" : "Like"}
    >
      <motion.div
        animate={{
          scale: isLiked ? [1, 1.3, 1] : 1,
        }}
        transition={{
          duration: 0.3,
          ease: "easeInOut",
        }}
      >
        <Heart
          className={`${iconSize} transition-colors ${
            isLiked ? "fill-red-500 text-red-500" : "text-slate-600 hover:text-slate-400"
          }`}
        />
      </motion.div>
    </motion.button>
  );
}
