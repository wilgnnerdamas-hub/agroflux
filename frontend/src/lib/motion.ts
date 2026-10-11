"use client";

// Microinterações leves (requestAnimationFrame), sempre respeitando prefers-reduced-motion.
import { useEffect, useState } from "react";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Conta de 0 até `target` em `ms` (ease-out cúbico). Com movimento reduzido, mostra o valor final. */
export function useCountUp(target: number | null | undefined, ms = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target == null) return;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return target == null ? null : value;
}

/** Digita `text` caractere por caractere em `ms`. Devolve o trecho visível e se ainda está digitando. */
export function useTyping(text: string | null, ms = 2000) {
  const [chars, setChars] = useState(0);
  useEffect(() => {
    if (!text) {
      setChars(0);
      return;
    }
    if (prefersReducedMotion()) {
      setChars(text.length);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setChars(Math.floor(p * text.length));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setChars(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms]);
  return { shown: text ? text.slice(0, chars) : "", typing: !!text && chars < text.length };
}
