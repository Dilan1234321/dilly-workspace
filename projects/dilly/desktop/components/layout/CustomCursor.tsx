"use client";

import { useEffect, useRef, useCallback } from "react";

/* ── Selectors ─────────────────────────────────────── */
const TEXT_SELECTOR = 'input:not([type="file"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]';
const DRAG_SELECTOR = '[draggable="true"], .cursor-grab, [data-dnd], .active\\:cursor-grabbing';
const EXTERNAL_SELECTOR = 'a[target="_blank"], a[href^="http"]';
const SCORE_SELECTOR = '[data-cursor-score]';
const CONTEXT_SELECTOR = '[data-contextmenu], [oncontextmenu]';
const INTERACTIVE_SELECTOR = 'a, button, [role="button"], [data-clickable], .sidebar-item, .ctx-item, .dilly-chip, select, label[for]';

type CursorMode = "default" | "text" | "drag" | "dragging" | "external" | "loading" | "score" | "scroll" | "resize" | "context" | "hover";

/**
 * Custom animated cursor ecosystem for Dilly Desktop.
 *
 * Modes:
 * - default:  vertical line (crosshair without horizontal)
 * - text:     tall pulsing vertical beam
 * - drag:     crosshair with arrowhead tips
 * - dragging: collapsed dot while mouse is down on draggable
 * - external: rotated 45° with extended arm
 * - loading:  rotating radar sweep
 * - score:    ring that fills to match score %
 * - scroll:   vertical line with directional chevron
 * - resize:   parallel lines with arrows
 * - context:  hover ring with center dot
 * - hover:    standard ring morph (buttons, links)
 */
export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number>(0);
  const modeRef = useRef<CursorMode>("default");
  const pressedRef = useRef(false);
  const visibleRef = useRef(false);
  const isDragTarget = useRef(false);

  const updateCursorPosition = useCallback(() => {
    const el = cursorRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
  }, []);

  const setMode = useCallback((mode: CursorMode) => {
    const el = cursorRef.current;
    if (!el || modeRef.current === mode) return;
    modeRef.current = mode;
    el.dataset.mode = mode;
  }, []);

  useEffect(() => {
    const el = cursorRef.current;
    if (!el) return;

    const onMouseMove = (e: MouseEvent) => {
      posRef.current.x = e.clientX;
      posRef.current.y = e.clientY;

      if (!visibleRef.current) {
        visibleRef.current = true;
        el.dataset.visible = "true";
      }

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateCursorPosition);

      const target = e.target as HTMLElement;

      // If dragging, stay in dragging mode
      if (pressedRef.current && isDragTarget.current) {
        setMode("dragging");
        return;
      }

      // Priority-based mode detection
      // 1. Text inputs
      if (target.closest(TEXT_SELECTOR)) {
        setMode("text");
        return;
      }

      // 2. Draggable elements
      if (target.closest(DRAG_SELECTOR)) {
        isDragTarget.current = true;
        setMode("drag");
        return;
      }
      isDragTarget.current = false;

      // 3. External links
      if (target.closest(EXTERNAL_SELECTOR)) {
        setMode("external");
        return;
      }

      // 4. Score elements (data-cursor-score="75" data-cursor-score-color="#FF9F0A")
      const scoreEl = target.closest(SCORE_SELECTOR) as HTMLElement | null;
      if (scoreEl) {
        const pct = scoreEl.dataset.cursorScore || "0";
        const color = scoreEl.dataset.cursorScoreColor || "#2B3A8E";
        el.style.setProperty("--score-pct", `${pct}%`);
        el.style.setProperty("--score-color", color);
        setMode("score");
        return;
      }

      // 5. Loading state (global)
      if (document.querySelector('.dilly-app-shell[data-loading="true"]')) {
        setMode("loading");
        return;
      }

      // 6. Scroll indicator — only for explicitly marked scroll containers, not the main page
      const scrollable = target.closest('[data-cursor-scroll]') as HTMLElement | null;
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight + 4) {
        const { scrollTop, scrollHeight, clientHeight } = scrollable;
        const atTop = scrollTop <= 2;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
        if (!atTop || !atBottom) {
          el.dataset.scrollDir = atTop ? "down" : atBottom ? "up" : "both";
          setMode("scroll");
          return;
        }
      }

      // 7. Resize grip (near right panel border)
      const aside = document.querySelector('aside.w-\\[380px\\]') as HTMLElement | null;
      if (aside) {
        const rect = aside.getBoundingClientRect();
        if (Math.abs(e.clientX - rect.left) < 4) {
          setMode("resize");
          return;
        }
      }

      // 8. Context menu elements
      if (target.closest(CONTEXT_SELECTOR)) {
        setMode("context");
        return;
      }

      // 9. Zones that explicitly want the default cursor (e.g. job grid)
      if (target.closest('[data-cursor-default]')) {
        setMode("default");
        return;
      }

      // 10. General interactive
      if (target.closest(INTERACTIVE_SELECTOR) || getComputedStyle(target).cursor === "pointer") {
        setMode("hover");
        return;
      }

      // 11. Default
      setMode("default");
    };

    const onMouseDown = () => {
      pressedRef.current = true;
      el.dataset.pressed = "true";
      if (isDragTarget.current) setMode("dragging");
    };

    const onMouseUp = () => {
      pressedRef.current = false;
      el.dataset.pressed = "false";
      if (modeRef.current === "dragging") setMode("default");
    };

    const onMouseLeave = () => {
      visibleRef.current = false;
      el.dataset.visible = "false";
    };

    // Block native context menu only if no component already handled it
    const onContextMenu = (e: MouseEvent) => {
      if (!e.defaultPrevented && !(e as any)._dillyHandled) {
        e.preventDefault();
      }
    };

    // Copy flash: listen for custom event
    const onCopyFlash = () => {
      el.dataset.copyFlash = "true";
      setTimeout(() => { el.dataset.copyFlash = "false"; }, 500);
    };

    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("contextmenu", onContextMenu);
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("dilly-copy-flash", onCopyFlash);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("contextmenu", onContextMenu);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("dilly-copy-flash", onCopyFlash);
      cancelAnimationFrame(rafRef.current);
    };
  }, [updateCursorPosition, setMode]);

  return (
    <div
      ref={cursorRef}
      className="dilly-cursor"
      data-visible="false"
      data-mode="default"
      data-pressed="false"
      data-copy-flash="false"
      data-scroll-dir="down"
    />
  );
}

/* ── Helpers ───────────────────────────────────────── */

function findScrollableParent(el: HTMLElement | null): HTMLElement | null {
  let node = el;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 4) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Call this after a copy action to trigger the green checkmark flash.
 * Example: navigator.clipboard.writeText(text).then(() => window.dispatchEvent(new Event('dilly-copy-flash')));
 */
export function triggerCopyFlash() {
  window.dispatchEvent(new Event("dilly-copy-flash"));
}
