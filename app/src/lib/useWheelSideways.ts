"use client";
import { useEffect, useRef } from "react";

/** A plain mouse wheel over the board scrolls it sideways (Tom, 29 Oct: "how do I scroll to the right?").
 *  A wheel over a column that still has room to scroll up or down keeps scrolling that column; trackpads and
 *  Shift+wheel already send sideways deltas and are left alone. */
export function useWheelSideways<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 || e.deltaY === 0 || e.ctrlKey) return;
      let n = e.target as HTMLElement | null;
      while (n && n !== el) {
        const s = getComputedStyle(n).overflowY;
        if ((s === "auto" || s === "scroll") && n.scrollHeight > n.clientHeight + 1) {
          const atTop = n.scrollTop <= 0, atBottom = n.scrollTop + n.clientHeight >= n.scrollHeight - 1;
          if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;   // the column takes it
        }
        n = n.parentElement;
      }
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  return ref;
}
