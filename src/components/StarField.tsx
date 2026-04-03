import { useRef, useEffect } from "react";

const TWO_PI = Math.PI * 2;
const MOUSE_LERP = 0.05;
const GLOW_THRESHOLD = 1.2;
const GLOW_RADIUS_SCALE = 4;
const GLOW_ALPHA_SCALE = 0.15;
const TWINKLE_BASE = 0.88;
const TWINKLE_RANGE = 0.12;

function randRange(min: number, max: number, rand: () => number): number {
  return min + rand() * (max - min);
}

type Range = [min: number, max: number];

interface LayerConfig {
  radius: Range;
  drift: Range;
  parallax: number;
  opacity: Range;
}

const LAYER_CONFIGS = {
  far: { radius: [0.3, 0.8], drift: [0.00003, 0.00008], parallax: 0.002, opacity: [0.2, 0.5] },
  mid: { radius: [0.6, 1.5], drift: [0.00008, 0.00015], parallax: 0.005, opacity: [0.4, 0.75] },
  near: { radius: [1.2, 2.5], drift: [0.00015, 0.00025], parallax: 0.012, opacity: [0.6, 1.0] },
} satisfies Record<string, LayerConfig>;

type Layer = keyof typeof LAYER_CONFIGS;

interface Star {
  initialNx: number;
  nx: number;
  ny: number;
  radius: number;
  driftSpeed: number;
  parallaxFactor: number;
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
    const nx = rand();
    return {
      initialNx: nx,
      nx,
      ny: rand(),
      radius: randRange(...config.radius, rand),
      driftSpeed: randRange(...config.drift, rand),
      parallaxFactor: config.parallax * randRange(0.8, 1.2, rand),
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

interface StarFieldProps {
  /** 外部からフレーム番号を指定する場合（Remotion 用）。未指定なら rAF で自走。 */
  frame?: number;
  /** 固定サイズ。未指定なら window サイズに追従。 */
  width?: number;
  height?: number;
  /** ドリフト速度の倍率（デフォルト: 1） */
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

  // Remotion モード: フレーム番号が変わるたびに描画
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

    for (const star of starsRef.current) {
      const nx = (star.initialNx + star.driftSpeed * speedMultiplier * externalFrame) % 1;
      const drawX = nx * w;
      const drawY = star.ny * h;

      const twinkle = Math.sin(externalFrame * star.twinkleSpeed + star.twinkleOffset);
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
  }, [isExternalFrame, externalFrame, fixedWidth, fixedHeight, speedMultiplier]);

  // インタラクティブモード: rAF で自走
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

      for (const star of stars) {
        star.nx += star.driftSpeed;
        if (star.nx >= 1) star.nx -= 1;

        const baseX = star.nx * w;
        const baseY = star.ny * h;

        const parallaxX = mouseX * star.parallaxFactor * w;
        const parallaxY = mouseY * star.parallaxFactor * h;
        const drawX = (((baseX + parallaxX) % w) + w) % w;
        const drawY = baseY + parallaxY;

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
  }, [isExternalFrame]);

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
