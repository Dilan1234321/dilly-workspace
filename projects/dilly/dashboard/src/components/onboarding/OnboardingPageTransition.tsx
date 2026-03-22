"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export function OnboardingPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="min-h-[100dvh] w-full min-w-0 overflow-x-hidden"
        style={{ pointerEvents: "auto" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
