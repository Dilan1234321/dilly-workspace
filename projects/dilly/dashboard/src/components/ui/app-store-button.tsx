"use client";

import React from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppStoreButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children"
> & {
  /** When set, renders an anchor that looks like the button (for App Store link). */
  href?: string;
  children?: React.ReactNode;
};

function AppleIcon({
  fill = "currentColor",
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill={fill} aria-hidden {...props}>
      <g>
        <path
          d="M18.546,12.763c0.024-1.87,1.004-3.597,2.597-4.576c-1.009-1.442-2.64-2.323-4.399-2.378    c-1.851-0.194-3.645,1.107-4.588,1.107c-0.961,0-2.413-1.088-3.977-1.056C6.122,5.927,4.25,7.068,3.249,8.867    c-2.131,3.69-0.542,9.114,1.5,12.097c1.022,1.461,2.215,3.092,3.778,3.035c1.529-0.063,2.1-0.975,3.945-0.975    c1.828,0,2.364,0.975,3.958,0.938c1.64-0.027,2.674-1.467,3.66-2.942c0.734-1.041,1.299-2.191,1.673-3.408    C19.815,16.788,18.548,14.879,18.546,12.763z"
        />
        <path
          d="M15.535,3.847C16.429,2.773,16.87,1.393,16.763,0c-1.366,0.144-2.629,0.797-3.535,1.829    c-0.895,1.019-1.349,2.351-1.261,3.705C13.352,5.548,14.667,4.926,15.535,3.847z"
        />
      </g>
    </svg>
  );
}

const content = (
  <>
    <AppleIcon className="size-5 shrink-0" />
    <div className="flex flex-col items-start justify-center pr-2 text-left">
      <span className="text-[10px] leading-none tracking-tighter">
        Download on the
      </span>
      <p className="text-base font-bold leading-none">App Store</p>
    </div>
  </>
);

export function AppStoreButton({
  className,
  href,
  variant,
  size,
  ...props
}: AppStoreButtonProps) {
  const baseClass = cn("h-11 gap-2", className);

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant, size }), baseClass)}
      >
        {content}
      </a>
    );
  }

  return (
    <Button className={baseClass} variant={variant} size={size} {...props}>
      {content}
    </Button>
  );
}
