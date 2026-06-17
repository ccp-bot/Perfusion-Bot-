'use client';

/**
 * CorThinking — "COR is thinking" indicator for the perfusion-bot chat.
 *
 * Uses the real COR render (public/COR-thinking.png — background removed) holding
 * the holographic heart. COR floats gently, the heart in his hand beats with a
 * lub-dub glow + expanding ring, and a thought trail pulses above his head.
 * Transparent, so it sits straight on the dark chat background.
 *
 * Heart glow is anchored to the heart in the PNG (69.3% x, 54.4% y). If you swap
 * the image, tweak --hx / --hy below.
 *
 * Usage:  <CorThinking />
 *         <CorThinking width={260} />
 */
export default function CorThinking({
  width = 260,
  src = '/COR-thinking.png',
  className,
}: {
  width?: number;
  src?: string;
  className?: string;
}) {
  return (
    <div className={`cor-wrap${className ? ' ' + className : ''}`} style={{ width }} role="img" aria-label="COR is thinking">
      <div className="cor-float">
        <img className="cor-img" src={src} alt="" draggable={false} />
        <span className="cor-ring" />
        <span className="cor-beat" />
      </div>
      <span className="cor-dots">
        <i /><i /><i />
      </span>

      <style jsx>{`
        .cor-wrap {
          --hx: 69.3%;
          --hy: 54.4%;
          position: relative;
          aspect-ratio: 1164 / 646;
          line-height: 0;
          user-select: none;
        }
        .cor-float {
          position: absolute;
          inset: 0;
          animation: cor-float 3s ease-in-out infinite;
        }
        .cor-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
        .cor-beat,
        .cor-ring {
          position: absolute;
          left: var(--hx);
          top: var(--hy);
          width: 24%;
          aspect-ratio: 1;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .cor-beat {
          background: radial-gradient(circle, rgba(120, 220, 255, 0.55) 0%, rgba(255, 70, 110, 0.35) 38%, rgba(45, 226, 230, 0) 68%);
          mix-blend-mode: screen;
          animation: cor-beat 1.1s ease-in-out infinite;
        }
        .cor-ring {
          width: 18%;
          border: 2px solid rgba(120, 220, 255, 0.7);
          mix-blend-mode: screen;
          animation: cor-ring 1.1s ease-out infinite;
        }
        .cor-dots {
          position: absolute;
          left: 47%;
          top: 4%;
          display: flex;
          gap: 7%;
          width: 22%;
        }
        .cor-dots i {
          flex: 1;
          aspect-ratio: 1;
          border-radius: 50%;
          background: #2de2e6;
          box-shadow: 0 0 8px rgba(45, 226, 230, 0.9);
          animation: cor-think 1.6s ease-in-out infinite;
        }
        .cor-dots i:nth-child(2) { animation-delay: 0.22s; }
        .cor-dots i:nth-child(3) { animation-delay: 0.44s; }

        @keyframes cor-float {
          0%, 100% { transform: translateY(0) rotate(-0.6deg); }
          50% { transform: translateY(-3.5%) rotate(0.6deg); }
        }
        @keyframes cor-beat {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
          12% { transform: translate(-50%, -50%) scale(1.22); opacity: 0.9; }
          24% { transform: translate(-50%, -50%) scale(1.05); opacity: 0.6; }
          36% { transform: translate(-50%, -50%) scale(1.16); opacity: 0.8; }
          50% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
        }
        @keyframes cor-ring {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.7; }
          70% { opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1.7); opacity: 0; }
        }
        @keyframes cor-think {
          0%, 100% { opacity: 0.25; transform: scale(0.7); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cor-float, .cor-beat, .cor-ring, .cor-dots i { animation: none; }
        }
      `}</style>
    </div>
  );
}
