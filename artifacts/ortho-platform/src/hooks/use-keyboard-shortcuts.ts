import { useEffect, useCallback } from "react";

export interface KeyboardShortcutHandlers {
  onUndo?: () => void;
  onRedo?: () => void;
  onResetView?: () => void;
  onPlayPause?: () => void;
  onNextTooth?: () => void;
  onPrevTooth?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const { onUndo, onRedo, onResetView, onPlayPause, onNextTooth, onPrevTooth, enabled = true } = handlers;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }
      if ((ctrl && e.key === "y") || (ctrl && e.shiftKey && e.key === "z")) {
        e.preventDefault();
        onRedo?.();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onResetView?.();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        onPlayPause?.();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        onNextTooth?.();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        onPrevTooth?.();
        return;
      }
    },
    [enabled, onUndo, onRedo, onResetView, onPlayPause, onNextTooth, onPrevTooth]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
