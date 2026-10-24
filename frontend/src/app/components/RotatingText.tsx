"use client";

import { useEffect, useState } from "react";

export default function RotatingText({ words, intervalMs = 2600 }: { words: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [words.length, intervalMs]);

  return (
    <span key={index} className="inline-block text-gradient animate-word">
      {words[index]}
    </span>
  );
}
