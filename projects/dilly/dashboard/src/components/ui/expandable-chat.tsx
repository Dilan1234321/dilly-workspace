"use client";

import React, { useRef, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ChatPosition = "bottom-right" | "bottom-left";
export type ChatSize = "sm" | "md" | "lg" | "xl" | "full";

const chatConfig = {
  dimensions: {
    sm: "sm:max-w-sm sm:max-h-[500px]",
    md: "sm:max-w-md sm:max-h-[600px]",
    lg: "sm:max-w-lg sm:max-h-[700px]",
    xl: "sm:max-w-xl sm:max-h-[800px]",
    full: "sm:w-full sm:h-full",
  },
  positions: {
    "bottom-right": "bottom-5 right-5",
    "bottom-left": "bottom-5 left-5",
  },
  chatPositions: {
    "bottom-right": "sm:bottom-[calc(100%+10px)] sm:right-0",
    "bottom-left": "sm:bottom-[calc(100%+10px)] sm:left-0",
  },
};

const panelAnimation = {
  initial: { opacity: 0, scale: 0.97, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 6 },
  transition: { type: "spring" as const, stiffness: 500, damping: 35 },
};

const backdropAnimation = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

interface ExpandableChatProps extends React.HTMLAttributes<HTMLDivElement> {
  position?: ChatPosition;
  size?: ChatSize;
  icon?: React.ReactNode;
  /** When "recruiter", FAB uses gold styling */
  theme?: "default" | "recruiter";
}

const ExpandableChat: React.FC<ExpandableChatProps> = ({
  className,
  position = "bottom-right",
  size = "md",
  icon,
  theme = "default",
  children,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const toggleChat = () => setIsOpen(!isOpen);

  return (
    <div
      className={cn(`fixed ${chatConfig.positions[position]} z-50`, className)}
      {...props}
    >
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="chat-backdrop"
              initial={backdropAnimation.initial}
              animate={backdropAnimation.animate}
              exit={backdropAnimation.exit}
              transition={backdropAnimation.transition}
              className="fixed inset-0 bg-black/40 z-40 sm:z-[49]"
              onClick={toggleChat}
              aria-hidden
            />
            <motion.div
              ref={chatRef}
              key="chat-panel"
              initial={panelAnimation.initial}
              animate={panelAnimation.animate}
              exit={panelAnimation.exit}
              transition={panelAnimation.transition}
              className={cn(
                "flex flex-col bg-background border border-border overflow-hidden sm:absolute sm:w-[90vw] sm:h-[80vh] fixed inset-0 w-full h-full sm:inset-auto origin-bottom z-50",
                "rounded-t-2xl sm:rounded-2xl sm:shadow-2xl sm:shadow-black/30 sm:border-white/10",
                "recruiter-expandable-chat",
                position === "bottom-right" ? "sm:origin-bottom-right" : "sm:origin-bottom-left",
                chatConfig.chatPositions[position],
                chatConfig.dimensions[size],
              )}
            >
            {children}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 sm:hidden"
              onClick={toggleChat}
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
          </>
        )}
      </AnimatePresence>
      <ExpandableChatToggle
        icon={icon}
        isOpen={isOpen}
        toggleChat={toggleChat}
        theme={theme}
      />
    </div>
  );
};

ExpandableChat.displayName = "ExpandableChat";

const ExpandableChatHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex items-center justify-between p-4 border-b border-border", className)}
    {...props}
  />
);

ExpandableChatHeader.displayName = "ExpandableChatHeader";

const ExpandableChatBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cn("flex-grow overflow-y-auto", className)} {...props} />;

ExpandableChatBody.displayName = "ExpandableChatBody";

const ExpandableChatFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cn("border-t border-border p-4", className)} {...props} />;

ExpandableChatFooter.displayName = "ExpandableChatFooter";

interface ExpandableChatToggleProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  isOpen: boolean;
  toggleChat: () => void;
  theme?: "default" | "recruiter";
}

const ExpandableChatToggle: React.FC<ExpandableChatToggleProps> = ({
  className,
  icon,
  isOpen,
  toggleChat,
  theme = "default",
  ...props
}) => (
  <button
    type="button"
    onClick={toggleChat}
    className={cn(
      "w-14 h-14 rounded-full shadow-md flex items-center justify-center hover:shadow-lg transition-all duration-300",
      "inline-flex shrink-0 items-center justify-center text-sm font-medium",
      theme === "recruiter" && "recruiter-chat-fab",
      className,
    )}
    style={
      theme === "recruiter"
        ? {
            backgroundColor: "#fdb913",
            color: "#040a16",
            border: "none",
          }
        : undefined
    }
    {...props}
  >
    {isOpen ? (
      <X className="h-6 w-6" />
    ) : (
      icon || <MessageCircle className="h-6 w-6" />
    )}
  </button>
);

ExpandableChatToggle.displayName = "ExpandableChatToggle";

export {
  ExpandableChat,
  ExpandableChatHeader,
  ExpandableChatBody,
  ExpandableChatFooter,
};
