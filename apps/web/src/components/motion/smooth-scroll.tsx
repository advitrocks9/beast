"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";

/** Window-scroll smoothing for document pages (landing, how-it-works). */
export function SmoothScrollRoot({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.14, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}

/** Container-scroll smoothing for the app shell's main column; keeps the
 * main landmark as the real scroll wrapper so anchors and j/k still work. */
export function SmoothScrollPane({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const wrapperRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced || !wrapperRef.current || !contentRef.current) return;
    const lenis = new Lenis({
      wrapper: wrapperRef.current,
      content: contentRef.current,
      lerp: 0.16,
      smoothWheel: true,
    });
    let frame: number;
    const loop = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [reduced]);

  return (
    <main ref={wrapperRef} className={className}>
      <div ref={contentRef}>{children}</div>
    </main>
  );
}
