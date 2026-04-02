import { useRef, useEffect } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

const TWO_PI = Math.PI * 2;
const GLOW_THRESHOLD = 1.2;
const GLOW_RADIUS_SCALE = 4;
const GLOW_ALPHA_SCALE = 0.15;
const TWINKLE_BASE = 0.88;
const TWINKLE_RANGE = 0.12;

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
const SPEED_MULTIPLIER = 2;

function randRange(min: number, max: number): number {
  return min + rand() * (max - min);
}

type Range = [min: number, max: number];

interface LayerConfig {
  radius: Range;
  drift: Range;
  opacity: Range;
}

const LAYER_CONFIGS = {
  far: { radius: [0.3, 0.8], drift: [0.00003, 0.00008], opacity: [0.2, 0.5] },
  mid: { radius: [0.6, 1.5], drift: [0.00008, 0.00015], opacity: [0.4, 0.75] },
  near: { radius: [1.2, 2.5], drift: [0.00015, 0.00025], opacity: [0.6, 1.0] },
} satisfies Record<string, LayerConfig>;

type Layer = keyof typeof LAYER_CONFIGS;

interface Star {
  initialNx: number;
  ny: number;
  radius: number;
  driftSpeed: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  r: number;
  g: number;
  b: number;
  rgbString: string;
}

function pickStarColor(): [number, number, number] {
  const r = rand();
  if (r < 0.6) return [255, 255, 255];
  if (r < 0.75) return [200, 220, 255];
  if (r < 0.85) return [255, 240, 220];
  if (r < 0.93) return [255, 210, 170];
  return [180, 200, 255];
}

function createStars(count: number, layer: Layer): Star[] {
  const config = LAYER_CONFIGS[layer];
  return Array.from({ length: count }, () => {
    const [r, g, b] = pickStarColor();
    return {
      initialNx: rand(),
      ny: rand(),
      radius: randRange(...config.radius),
      driftSpeed: randRange(...config.drift),
      baseOpacity: randRange(...config.opacity),
      twinkleSpeed: randRange(0.008, 0.033),
      twinkleOffset: rand() * TWO_PI,
      r,
      g,
      b,
      rgbString: `rgb(${r},${g},${b})`,
    };
  });
}

export default function StarFieldVideo() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[] | null>(null);

  if (starsRef.current === null) {
    starsRef.current = [
      ...createStars(1000, "far"),
      ...createStars(350, "mid"),
      ...createStars(150, "near"),
    ];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !starsRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#020010");
    grad.addColorStop(0.4, "#050520");
    grad.addColorStop(0.75, "#0a0a30");
    grad.addColorStop(1, "#101040");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    for (const star of starsRef.current) {
      const nx = (star.initialNx + star.driftSpeed * SPEED_MULTIPLIER * frame) % 1;
      const drawX = nx * width;
      const drawY = star.ny * height;

      const twinkle = Math.sin(frame * star.twinkleSpeed + star.twinkleOffset);
      const alpha = star.baseOpacity * (TWINKLE_BASE + twinkle * TWINKLE_RANGE);

      if (star.radius > GLOW_THRESHOLD) {
        const glowRadius = star.radius * GLOW_RADIUS_SCALE;
        const glow = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, glowRadius);
        glow.addColorStop(0, `rgba(${star.r},${star.g},${star.b},${alpha * GLOW_ALPHA_SCALE})`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(drawX - glowRadius, drawY - glowRadius, glowRadius * 2, glowRadius * 2);
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.rgbString;
      ctx.beginPath();
      ctx.arc(drawX, drawY, star.radius, 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }, [frame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
    />
  );
}
