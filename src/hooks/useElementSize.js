import { useLayoutEffect, useRef, useState } from "react";

function useElementSize() {
  const elementRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = elementRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      const nextWidth = node.clientWidth || 0;
      const nextHeight = node.clientHeight || 0;
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { elementRef, width: size.width, height: size.height };
}

export default useElementSize;
