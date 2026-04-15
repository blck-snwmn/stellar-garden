import { useRef, useEffect } from "react";

const TWO_PI = Math.PI * 2;
const GLOW_THRESHOLD = 1.2;
const GLOW_RADIUS_SCALE = 4;
const GLOW_ALPHA_SCALE = 0.15;
const TWINKLE_BASE = 0.88;
const TWINKLE_RANGE = 0.12;

/** Angular velocity shared by all stars (rad/frame) */
const ROTATION_SPEED = 0.0003;

/** Rotation center (normalized coordinates) */
const CENTER_X = 0.5;
const CENTER_Y = 0.54;

function randRange(min: number, max: number, rand: () => number): number {
  return min + rand() * (max - min);
}

type Range = [min: number, max: number];

/**
 * Distance range from the rotation center (ratio to screen diagonal).
 * Shared across all layers. In the polar rotation model, distance determines
 * visual speed, so varying it per layer would also change star distribution.
 * Like real celestial motion, all layers share the same distance range.
 */
const STAR_DISTANCE: Range = [0.008, 0.8];

/** Apparent magnitude range for generated stars */
const MAG_MIN = 1.0;
const MAG_MAX = 6.5;

/** Pre-computed constants for magnitude inverse-CDF: N(m) ∝ 10^(0.5·m) */
const MAG_CDF_BASE = Math.pow(10, 0.5 * MAG_MIN);
const MAG_CDF_RANGE = Math.pow(10, 0.5 * MAG_MAX) - MAG_CDF_BASE;

/** Total number of stars to generate (viewport clips ~60%, so this is intentionally high) */
const STAR_COUNT = 14500;

/**
 * Atmospheric extinction: stars near the horizon (far from pole) are dimmed
 * because their light passes through more atmosphere.
 * The parameter controls how aggressively opacity drops off with distance.
 */
const EXTINCTION_STRENGTH = 0.7;

interface Star {
  /** Distance from rotation center (multiplied by diagonal length for px) */
  distance: number;
  /** Initial angle (rad) */
  angle: number;
  radius: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  r: number;
  g: number;
  b: number;
  rgbString: string;
}

/** Generate a random apparent magnitude following realistic star-count distribution */
function randomMagnitude(rand: () => number): number {
  return 2 * Math.log10(rand() * MAG_CDF_RANGE + MAG_CDF_BASE);
}

/**
 * Derive visual radius from magnitude.
 * Models the eye/camera PSF: brighter stars appear larger.
 * mag 1 → ~3.0, mag 3 → ~1.6, mag 6.5 → ~0.5
 */
function radiusFromMag(mag: number, rand: () => number): number {
  const base = 4.16 * Math.pow(10, -0.1415 * mag);
  return base * (0.85 + rand() * 0.3);
}

/** Derive base opacity from magnitude. mag 1 → ~1.0, mag 6.5 → ~0.3 */
function opacityFromMag(mag: number, rand: () => number): number {
  const base = 1.0 - 0.127 * (mag - MAG_MIN);
  return Math.max(0.2, base * (0.9 + rand() * 0.2));
}

/**
 * Star color selection based on magnitude.
 * Only bright stars (≤ mag ~2) show clear color to the naked eye;
 * faint stars appear white due to scotopic (rod-dominated) vision.
 */
function pickStarColor(rand: () => number, mag: number): [number, number, number] {
  const colorChance = mag <= 2 ? 0.6 : mag <= 3.5 ? 0.25 : mag <= 5 ? 0.08 : 0.03;

  if (rand() > colorChance) {
    if (mag > 4) return [255, 255, 255];
    const tint = rand();
    if (tint < 0.5) return [255, 255, 255];
    if (tint < 0.75) return [250, 252, 255];
    return [255, 253, 250];
  }

  const r = rand();
  if (mag <= 2) {
    if (r < 0.3) return [200, 220, 255]; // blue-white (B)
    if (r < 0.55) return [255, 240, 220]; // yellow-white (F/G)
    if (r < 0.8) return [255, 210, 170]; // orange (K)
    return [255, 180, 140]; // red-orange (M)
  }
  if (mag <= 4) {
    if (r < 0.35) return [220, 230, 255]; // subtle blue-white
    if (r < 0.65) return [255, 245, 230]; // subtle warm
    return [255, 225, 200]; // mild orange
  }
  if (r < 0.5) return [245, 248, 255]; // barely blue
  return [255, 250, 245]; // barely warm
}

function createAllStars(rand: () => number): Star[] {
  return Array.from({ length: STAR_COUNT }, () => {
    const mag = randomMagnitude(rand);
    const [r, g, b] = pickStarColor(rand, mag);
    return {
      distance: STAR_DISTANCE[0] + Math.sqrt(rand()) * (STAR_DISTANCE[1] - STAR_DISTANCE[0]),
      angle: rand() * TWO_PI,
      radius: radiusFromMag(mag, rand),
      baseOpacity: opacityFromMag(mag, rand),
      twinkleSpeed: randRange(0.008, 0.033, rand),
      twinkleOffset: rand() * TWO_PI,
      r,
      g,
      b,
      rgbString: `rgb(${r},${g},${b})`,
    };
  });
}

function createSkyGradient(ctx: CanvasRenderingContext2D, h: number): CanvasGradient {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#020010");
  grad.addColorStop(0.4, "#050520");
  grad.addColorStop(0.75, "#0a0a30");
  grad.addColorStop(1, "#101040");
  return grad;
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  w: number,
  h: number,
  time: number,
  speedMultiplier: number,
  centerOffsetX: number,
  centerOffsetY: number,
): void {
  const diagonal = Math.sqrt(w * w + h * h);
  const cx = w * CENTER_X + centerOffsetX;
  const cy = h * CENTER_Y + centerOffsetY;
  const rotation = ROTATION_SPEED * speedMultiplier * time;

  for (const star of stars) {
    const currentAngle = star.angle + rotation;
    const dist = star.distance * diagonal;
    const drawX = cx + dist * Math.cos(currentAngle);
    const drawY = cy + dist * Math.sin(currentAngle);

    // Skip stars outside the viewport
    if (drawX < -10 || drawX > w + 10 || drawY < -10 || drawY > h + 10) continue;

    const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
    // Atmospheric extinction: dim stars further from the pole (horizon direction)
    const normalizedDist = star.distance / STAR_DISTANCE[1];
    const extinction = 1 - normalizedDist * normalizedDist * EXTINCTION_STRENGTH;
    const alpha = star.baseOpacity * (TWINKLE_BASE + twinkle * TWINKLE_RANGE) * extinction;

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
}

/** Draw Polaris (the pole star) */
function drawPolaris(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const glowRadius = 8;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
  glow.addColorStop(0, "rgba(255,248,235,0.25)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - glowRadius, cy - glowRadius, glowRadius * 2, glowRadius * 2);

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgb(255,248,235)";
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, TWO_PI);
  ctx.fill();
}

interface StarFieldProps {
  /** External frame number (for Remotion). If omitted, runs via rAF. */
  frame?: number;
  /** Fixed size. If omitted, follows window size. */
  width?: number;
  height?: number;
  /** Rotation speed multiplier (default: 1) */
  speedMultiplier?: number;
  /** Random function for star generation (default: Math.random) */
  rand?: () => number;
}

export default function StarField({
  frame: externalFrame,
  width: fixedWidth,
  height: fixedHeight,
  speedMultiplier = 1,
  rand = Math.random,
}: StarFieldProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[] | null>(null);

  if (starsRef.current === null) {
    starsRef.current = createAllStars(rand);
  }

  const isExternalFrame = externalFrame != null;

  // Remotion mode: render on each frame change
  useEffect(() => {
    if (!isExternalFrame) return;

    const canvas = canvasRef.current;
    if (!canvas || !starsRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = fixedWidth ?? canvas.width;
    const h = fixedHeight ?? canvas.height;
    const skyGradient = createSkyGradient(ctx, h);

    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h);

    drawStars(ctx, starsRef.current, w, h, externalFrame, speedMultiplier, 0, 0);
    drawPolaris(ctx, w * CENTER_X, h * CENTER_Y);

    ctx.globalAlpha = 1;
  }, [isExternalFrame, externalFrame, fixedWidth, fixedHeight, speedMultiplier]);

  // Interactive mode: self-running via rAF
  useEffect(() => {
    if (isExternalFrame) return;

    const canvas = canvasRef.current;
    if (!canvas || !starsRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let skyGradient: CanvasGradient;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      skyGradient = createSkyGradient(ctx, canvas.height);
    };
    resize();

    let time = 0;
    const stars = starsRef.current;

    const draw = () => {
      time++;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, w, h);

      drawStars(ctx, stars, w, h, time, speedMultiplier, 0, 0);
      drawPolaris(ctx, w * CENTER_X, h * CENTER_Y);

      ctx.globalAlpha = 1;
      animationId = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize);
    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, [isExternalFrame, speedMultiplier]);

  if (isExternalFrame) {
    return <canvas ref={canvasRef} width={fixedWidth} height={fixedHeight} />;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
      }}
    />
  );
}
