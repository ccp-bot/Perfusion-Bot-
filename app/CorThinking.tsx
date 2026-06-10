"use client";

import { useState, useEffect, useRef } from "react";

/* ============================================================
   COR thinking indicator
   A flowing CPB circuit (venous blue -> oxygenator -> arterial red)
   next to a cycling line of perfusion phrases.
   Usage:  <CorThinking />
   Props (all optional):
     phrases   array of strings to cycle through
     interval  ms each phrase stays up (default 2200)
     base      resting text color
     accentA   venous color   accentB  arterial color
   ============================================================ */

const DEFAULT_PHRASES = [
  "Priming the circuit",
  "De-airing the lines",
  "Zeroing the pressures",
  "Going on bypass",
  "Establishing full flow",
  "Holding the MAP steady",
  "Titrating the sweep",
  "Watching the venous sat",
  "Drawing an ACT",
  "Topping off the reservoir",
  "Cooling to target",
  "Cross-referencing AmSECT",
  "Checking the gas line",
  "Rewarming gently",
  "Filling the heart",
  "Weaning off bypass",
];

const ACCENT_A = "#3aa0ff"; // venous blue
const ACCENT_B = "#ff4d5e"; // arterial red

function CircuitFlow({ accentA, accentB }: { accentA: string; accentB: string }) {
  return (
    <svg width="58" height="34" viewBox="0 0 58 34" aria-hidden="true">
      <defs>
        <linearGradient id="corCircuitGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={accentA} />
          <stop offset="100%" stopColor={accentB} />
        </linearGradient>
      </defs>
      {/* base loop: blue at the venous bottom, red at the arterial top */}
      <rect
        x="5" y="6" width="48" height="22" rx="11"
        fill="none" stroke="url(#corCircuitGrad)" strokeWidth="2.5"
      />
      {/* oxygenator: where blue becomes red */}
      <rect x="22" y="2.5" width="14" height="6" rx="1.5" fill={accentB} opacity="0.9" />
      {/* pump on the return limb */}
      <circle cx="29" cy="31" r="2.6" fill={accentA} />
      {/* flowing highlights traveling around the loop */}
      <rect
        className="corf-flow"
        x="5" y="6" width="48" height="22" rx="11"
        fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5"
        strokeLinecap="round" strokeDasharray="5 15"
      />
    </svg>
  );
}

type CorThinkingProps = {
  phrases?: string[];
  interval?: number;
  base?: string;
  accentA?: string;
  accentB?: string;
};

export default function CorThinking({
  phrases = DEFAULT_PHRASES,
  interval = 2200,
  base = "#8b97a6",
  accentA = ACCENT_A,
  accentB = ACCENT_B,
}: CorThinkingProps) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      setShown(false);
      const t = setTimeout(() => {
        setIndex((i) => (i + 1) % phrases.length);
        setShown(true);
      }, 280);
      timers.current.push(t);
    }, interval);
    return () => {
      clearInterval(id);
      timers.current.forEach(clearTimeout);
    };
  }, [phrases.length, interval]);

  return (
    <div className="cor-think" role="status" aria-live="polite">
      <style>{`
        .cor-think{
          display:inline-flex; align-items:center; gap:12px;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .cor-think svg{ flex:none; overflow:visible }
        .corf-flow{ animation: corfFlow 1.1s linear infinite }
        @keyframes corfFlow{ to{ stroke-dashoffset:-20 } }

        .cor-phrase{
          font-size:15px; font-weight:500; letter-spacing:.1px; color:${base};
          background: linear-gradient(90deg, ${base} 0%, ${base} 38%, ${accentA} 50%, ${accentB} 58%, ${base} 70%, ${base} 100%);
          background-size:220% 100%;
          -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
          animation: corFlow 4.5s linear infinite;
          transition: opacity .28s ease, transform .28s ease;
        }
        @keyframes corFlow{ 0%{ background-position:120% 0 } 100%{ background-position:-120% 0 } }
        .cor-phrase.out{ opacity:0; transform:translateY(4px) }
        .cor-phrase.in{ opacity:1; transform:translateY(0) }
        .cor-ellipsis{ color:${base}; opacity:.6 }

        @media (prefers-reduced-motion: reduce){
          .corf-flow{ animation:none }
          .cor-phrase{ animation:none; -webkit-text-fill-color:${accentA}; color:${accentA} }
          .cor-phrase.out{ opacity:0 }
        }
      `}</style>

      <CircuitFlow accentA={accentA} accentB={accentB} />
      <span className={`cor-phrase ${shown ? "in" : "out"}`}>
        {phrases[index]}
        <span className="cor-ellipsis">…</span>
      </span>
    </div>
  );
}
