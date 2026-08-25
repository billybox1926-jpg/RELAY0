import React, { useEffect, useRef, useState } from 'react';

interface MatrixRainBackgroundProps {
  active: boolean;
  opacity?: number;
  showWatermark?: boolean;
}

// Matrix glyph set: Katakana, Cyrillic, Hex runes, Binary, Terminal symbols, Math glyphs
const GLYPHS =
  'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ01234567890123456789ABCDEF:・."=*+-<>¦｜⚡◈λΩ§µΣΨΦЖДЛФ';

export const MatrixRainBackground: React.FC<MatrixRainBackgroundProps> = ({
  active,
  opacity = 0.9,
  showWatermark = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const fontSize = 16;
    let columns = Math.floor(width / fontSize);
    let drops: number[] = [];
    let speeds: number[] = [];
    let leadChars: string[] = [];
    let trailLengths: number[] = [];

    const initColumns = () => {
      columns = Math.floor(width / fontSize);
      drops = [];
      speeds = [];
      leadChars = [];
      trailLengths = [];
      for (let i = 0; i < columns; i++) {
        // Staggered starting heights
        drops[i] = Math.floor(Math.random() * -60);
        speeds[i] = 0.65 + Math.random() * 0.75;
        leadChars[i] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        trailLengths[i] = 8 + Math.floor(Math.random() * 16);
      }
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initColumns();
    };

    window.addEventListener('resize', handleResize);
    initColumns();

    // Initial backdrop fill
    ctx.fillStyle = 'rgba(5, 10, 5, 1)';
    ctx.fillRect(0, 0, width, height);

    let lastTime = performance.now();

    const render = (time: number) => {
      const delta = time - lastTime;
      if (delta > 28) {
        lastTime = time;

        // Semi-transparent fade layer to create continuous phosphor decay
        ctx.fillStyle = 'rgba(5, 10, 5, 0.12)';
        ctx.fillRect(0, 0, width, height);

        ctx.font = `${fontSize}px "Share Tech Mono", monospace`;

        for (let i = 0; i < drops.length; i++) {
          const x = i * fontSize;
          const y = drops[i] * fontSize;

          // Occasionally flip a character
          const char = Math.random() > 0.88
            ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
            : leadChars[i] || GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          leadChars[i] = char;

          // Draw head
          if (y > 0 && y < height + fontSize) {
            // Bright white/glowing head character
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 8;
            ctx.fillText(char, x, y);

            // 1st trailing bright green character
            const t1 = y - fontSize;
            if (t1 > 0) {
              ctx.fillStyle = '#a3ffa3';
              ctx.shadowColor = '#00ff41';
              ctx.shadowBlur = 5;
              const c1 = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
              ctx.fillText(c1, x, t1);
            }

            // 2nd trailing deep green character
            const t2 = y - fontSize * 2;
            if (t2 > 0) {
              ctx.fillStyle = '#00ff41';
              ctx.shadowBlur = 2;
              const c2 = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
              ctx.fillText(c2, x, t2);
            }

            // Reset shadow to keep 60fps performance
            ctx.shadowBlur = 0;
          }

          // Advance stream
          drops[i] += speeds[i];

          // Reset drop once below viewport with slight randomization
          if (drops[i] * fontSize > height && Math.random() > 0.975) {
            drops[i] = 0;
            speeds[i] = 0.6 + Math.random() * 0.85;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      id="matrix-rain-overlay"
      className={`fixed inset-0 z-20 pointer-events-none transition-opacity duration-1000 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ opacity: active ? opacity : 0 }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
      />

      {/* Screensaver Deep Scan HUD Banner */}
      {showWatermark && active && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded border border-[#00ff4180] bg-[#050e05ee] px-4 py-2 text-xs font-mono text-[#00ff41] shadow-[0_0_20px_rgba(0,255,65,0.4)] backdrop-blur-sm animate-pulse">
          <span className="h-2 w-2 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]" />
          <span className="font-bold tracking-widest text-white">
            TERMINAL IDLE // MATRIX CARRIER SCROLL ACTIVE
          </span>
          <span className="text-[#88ff88] hidden sm:inline">
            [MOVE MOUSE OR PRESS KEY TO RESUME]
          </span>
        </div>
      )}
    </div>
  );
};
