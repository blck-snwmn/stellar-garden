import { useCurrentFrame, useVideoConfig } from "remotion";
import StarField from "../src/components/StarField";

const SPEED_MULTIPLIER = 2;

/** シード付き疑似乱数生成器 (mulberry32) */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seededRandom(42);

export default function StarFieldVideo() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <StarField
      frame={frame}
      width={width}
      height={height}
      speedMultiplier={SPEED_MULTIPLIER}
      rand={rand}
    />
  );
}
