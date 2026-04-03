import { useRef, useEffect } from "react";

const TWO_PI = Math.PI * 2;
const MOUSE_LERP = 0.05;
const GLOW_THRESHOLD = 1.2;
const GLOW_RADIUS_SCALE = 4;
const GLOW_ALPHA_SCALE = 0.15;
const TWINKLE_BASE = 0.88;
const TWINKLE_RANGE = 0.12;

/** 全星共通の角速度 (rad/frame) */
const ROTATION_SPEED = 0.0003;

/** 回転中心（正規化座標） */
const CENTER_X = 0.5;
const CENTER_Y = 0.54;

function randRange(min: number, max: number, rand: () => number): number {
  return min + rand() * (max - min);
}

type Range = [min: number, max: number];

interface LayerConfig {
  radius: Range;
  /** 中心からの距離レンジ（画面対角線に対する比率） */
  distance: Range;
  opacity: Range;
}

const LAYER_CONFIGS = {
  far: { radius: [0.3, 0.8], distance: [0.0, 0.3], opacity: [0.2, 0.5] },
  mid: { radius: [0.6, 1.5], distance: [0.15, 0.55], opacity: [0.4, 0.75] },
  near: { radius: [1.2, 2.5], distance: [0.35, 0.8], opacity: [0.6, 1.0] },
} satisfies Record<string, LayerConfig>;

type Layer = keyof typeof LAYER_CONFIGS;

interface Star {
  /** 回転中心からの距離（px 計算時に対角線長を掛ける） */
  distance: number;
  /** 初期角度 (rad) */
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

function pickStarColor(rand: () => number): [number, number, number] {
  const r = rand();
  if (r < 0.6) return [255, 255, 255];
  if (r < 0.75) return [200, 220, 255];
  if (r < 0.85) return [255, 240, 220];
  if (r < 0.93) return [255, 210, 170];
  return [180, 200, 255];
}

function createStars(count: number, layer: Layer, rand: () => number): Star[] {
  const config = LAYER_CONFIGS[layer];

  return Array.from({ length: count }, () => {
    const [r, g, b] = pickStarColor(rand);
    return {
      distance: randRange(...config.distance, rand),
      angle: rand() * TWO_PI,
      radius: randRange(...config.radius, rand),
      baseOpacity: randRange(...config.opacity, rand),
      twinkleSpeed: randRange(0.008, 0.033, rand),
      twinkleOffset: rand() * TWO_PI,
      r,
      g,
      b,
      rgbString: `rgb(${r},${g},${b})`,
    };
  });
}

function createAllStars(rand: () => number): Star[] {
  return [
    ...createStars(1000, "far", rand),
    ...createStars(350, "mid", rand),
    ...createStars(150, "near", rand),
  ];
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

    // 画面外なら描画スキップ
    if (drawX < -10 || drawX > w + 10 || drawY < -10 || drawY > h + 10) continue;

    const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
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
}

/** 北極星を描画 */
function drawPolaris(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
): void {
  const glowRadius = 8;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
  glow.addColorStop(0, "rgba(220,230,255,0.25)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - glowRadius, cy - glowRadius, glowRadius * 2, glowRadius * 2);

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgb(220,230,255)";
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, TWO_PI);
  ctx.fill();
}

interface StarFieldProps {
  /** 外部からフレーム番号を指定する場合（Remotion 用）。未指定なら rAF で自走。 */
  frame?: number;
  /** 固定サイズ。未指定なら window サイズに追従。 */
  width?: number;
  height?: number;
  /** 回転速度の倍率（デフォルト: 1） */
  speedMultiplier?: number;
  /** 星生成用の乱数関数（デフォルト: Math.random） */
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

  // Remotion モード
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

  // インタラクティブモード
  useEffect(() => {
    if (isExternalFrame) return;

    const canvas = canvasRef.current;
    if (!canvas || !starsRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;
    let skyGradient: CanvasGradient;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      skyGradient = createSkyGradient(ctx, canvas.height);
    };
    resize();

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    let time = 0;
    const stars = starsRef.current;

    const draw = () => {
      time++;
      const w = canvas.width;
      const h = canvas.height;

      mouseX += (targetMouseX - mouseX) * MOUSE_LERP;
      mouseY += (targetMouseY - mouseY) * MOUSE_LERP;

      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, w, h);

      const offsetX = mouseX * w * 0.01;
      const offsetY = mouseY * h * 0.01;

      drawStars(ctx, stars, w, h, time, speedMultiplier, offsetX, offsetY);
      drawPolaris(ctx, w * CENTER_X + offsetX, h * CENTER_Y + offsetY);

      ctx.globalAlpha = 1;
      animationId = requestAnimationFrame(draw);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", resize);
    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", resize);
    };
  }, [isExternalFrame, speedMultiplier]);

  if (isExternalFrame) {
    return (
      <canvas
        ref={canvasRef}
        width={fixedWidth}
        height={fixedHeight}
      />
    );
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
