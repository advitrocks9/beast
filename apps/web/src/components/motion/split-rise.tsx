"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

const MOTION_TAGS = {
  h1: motion.h1,
  h2: motion.h2,
  p: motion.p,
  span: motion.span,
} as const;

export function SplitRise({
  text,
  className,
  as = "h1",
  delay = 0,
}: {
  text: string;
  className?: string;
  as?: keyof typeof MOTION_TAGS;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const words = text.split(" ");
  const MotionTag = MOTION_TAGS[as];

  return (
    <MotionTag className={className} aria-label={text} initial="hidden" animate="show">
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span
            aria-hidden
            className="inline-block"
            variants={{
              hidden: reduced ? { opacity: 0 } : { y: "0.9em", opacity: 0 },
              show: {
                y: 0,
                opacity: 1,
                transition: { duration: 0.55, ease: EASE, delay: delay + i * 0.045 },
              },
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}
