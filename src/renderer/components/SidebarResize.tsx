import { useEffect, useRef, useState, type ComponentProps } from "react";
import { usePanelRef } from "react-resizable-panels";
import type { ResizablePanelGroup } from "./ui/resizable";

export const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;

function viewport() {
  return {
    width: window.innerWidth,
    compact: window.innerWidth <= 1000,
    maximum: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - 760)),
  };
}

/** The shadcn panel group owns pointer tracking, keyboard resizing and ARIA */
export function useSidebarLayout(
  savedWidth: number | undefined,
  onCommit: (width: number) => void,
) {
  const [size, setSize] = useState(viewport);
  const panelRef = usePanelRef();
  const elementRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    const resize = () => setSize(viewport());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    // Let the library finish its ResizeObserver constraint pass before applying
    // a persisted preference, and avoid producing another layout for a no-op
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = size.compact
        ? 64
        : Math.min(size.maximum, savedWidth ?? DEFAULT_SIDEBAR_WIDTH);
      if (Math.abs(panel.getSize().inPixels - target) > 0.5) panel.resize(target);
    });
    return () => cancelAnimationFrame(frame);
  }, [savedWidth, size.width, size.compact, size.maximum, panelRef]);

  const onLayoutChanged: ComponentProps<typeof ResizablePanelGroup>["onLayoutChanged"] = (
    layout,
    meta,
  ) => {
    const group = elementRef.current?.parentElement;
    if (size.compact || !meta.isUserInteraction || !group) return;
    // Store callbacks can precede React's DOM commit, so use the panel's current
    // layout size instead of measuring the previous rendered width
    const availableWidth = Array.from(group.children).reduce(
      (total, child) => total + (child.hasAttribute("data-panel") ? (child as HTMLElement).offsetWidth : 0),
      0,
    );
    const width = Math.round((layout.sidebar / 100) * availableWidth);
    if (width >= MIN_WIDTH && width <= MAX_WIDTH && width !== savedWidth) commitRef.current(width);
  };

  return {
    panelRef,
    elementRef,
    compact: size.compact,
    minimum: size.compact ? 64 : MIN_WIDTH,
    maximum: size.compact ? 64 : size.maximum,
    defaultSize: size.compact ? 64 : (savedWidth ?? DEFAULT_SIDEBAR_WIDTH),
    onLayoutChanged,
    reset: () => {
      panelRef.current?.resize(size.compact ? 64 : Math.min(size.maximum, DEFAULT_SIDEBAR_WIDTH));
      commitRef.current(DEFAULT_SIDEBAR_WIDTH);
    },
  };
}
