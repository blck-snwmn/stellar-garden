import { useRef, useEffect } from "react";

interface Star {
  /** 正規化された座標 (0~1) */
  nx: number;
  ny: number;
  radius: number;
  /** 横方向の流れ速度 (天球回転) */
  driftSpeed: number;
  parallaxFactor: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  /** 星の色温度 (暖色~寒色) */
  color: [number, number, number];
}

function starColor(): [number, number, number] {
  const r = Math.random();
  if (r < 0.6) return [255, 255, 255];       // 白
  if (r < 0.75) return [200, 220, 255];       // 青白い
  if (r < 0.85) return [255, 240, 220];       // やや暖色
  if (r < 0.93) return [255, 210, 170];       // オレンジがかった
  return [180, 200, 255];                     // 青い
}

function createStars(
  count: number,
  layer: "far" | "mid" | "near"
): Star[] {
  const config = {
    far:  { radius: [0.3, 0.8],  drift: [0.00003, 0.00008], parallax: 0.002, opacity: [0.2, 0.5] },
    mid:  { radius: [0.6, 1.5],  drift: [0.00008, 0.00015], parallax: 0.005, opacity: [0.4, 0.75] },
    near: { radius: [1.2, 2.5],  drift: [0.00015, 0.00025], parallax: 0.012, opacity: [0.6, 1.0] },
  }[layer];

  return Array.from({ length: count }, () => ({
    nx: Math.random(),
    ny: Math.random(),
    radius: config.radius[0] + Math.random() * (config.radius[1] - config.radius[0]),
    driftSpeed: config.drift[0] + Math.random() * (config.drift[1] - config.drift[0]),
    parallaxFactor: config.parallax * (0.8 + Math.random() * 0.4),
    baseOpacity: config.opacity[0] + Math.random() * (config.opacity[1] - config.opacity[0]),
    twinkleSpeed: 0.008 + Math.random() * 0.025,
    twinkleOffset: Math.random() * Math.PI * 2,
    color: starColor(),
  }));
}

function drawSkyGradient(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#020010");      // 天頂: 深い紺
  grad.addColorStop(0.4, "#050520");    // 中間
  grad.addColorStop(0.75, "#0a0a30");   // 下部: やや明るい紺
  grad.addColorStop(1, "#101040");      // 地平線付近
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();

    const allStars = [
      ...createStars(1000, "far"),
      ...createStars(350, "mid"),
      ...createStars(150, "near"),
    ];

    function handleMouseMove(e: MouseEvent) {
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    }

    function handleResize() {
      resize();
    }

    let time = 0;

    function draw() {
      time++;
      const w = canvas!.width;
      const h = canvas!.height;

      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      drawSkyGradient(ctx!, w, h);

      for (const star of allStars) {
        // 横方向にゆっくり流す（天球の日周運動）
        star.nx = ((star.nx + star.driftSpeed) % 1 + 1) % 1;

        const baseX = star.nx * w;
        const baseY = star.ny * h;

        const parallaxX = mouseX * star.parallaxFactor * w;
        const parallaxY = mouseY * star.parallaxFactor * h;
        const drawX = ((baseX + parallaxX) % w + w) % w;
        const drawY = baseY + parallaxY;

        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
        const alpha = star.baseOpacity * (0.88 + twinkle * 0.12);

        const [r, g, b] = star.color;

        // 明るい星にはほんのりグロー
        if (star.radius > 1.2) {
          const glowRadius = star.radius * 4;
          const glow = ctx!.createRadialGradient(
            drawX, drawY, 0,
            drawX, drawY, glowRadius,
          );
          glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.15})`);
          glow.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx!.fillStyle = glow;
          ctx!.fillRect(
            drawX - glowRadius, drawY - glowRadius,
            glowRadius * 2, glowRadius * 2,
          );
        }

        ctx!.beginPath();
        ctx!.arc(drawX, drawY, star.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx!.fill();
      }

      animationId = requestAnimationFrame(draw);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", handleResize);
    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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
