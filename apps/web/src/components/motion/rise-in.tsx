"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

export function RiseIn({
  children,
  className,
  delay = 0,
  inView = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  inView?: boolean;
}) {
  const reduced = useReducedMotion();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, y: 14 };
  const shown = { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay } };

  return (
    <motion.div
      className={className}
      initial={hidden}
      {...(inView
        ? { whileInView: shown, viewport: { once: true, margin: "-60px" } }
        : { animate: shown })}
    >
      {children}
    </motion.div>
  );
}
