import React from 'react';

// Wave path drawn 2x wide (two identical periods) so sliding it by -50% loops seamlessly.
// Quadratic + T keeps the curve smooth; the period is 600 units, so x=0..600 equals x=600..1200.
export const WAVE_PATH = 'M0 20 Q 150 0 300 20 T 600 20 T 900 20 T 1200 20 V 60 H 0 Z';

interface WaveProps {
  className?: string; // fill-* color + animation class
  style?: React.CSSProperties;
}

// One horizontally drifting wave band. Parent decides position/height.
export const Wave: React.FC<WaveProps> = ({ className = '', style }) => (
  <svg
    viewBox="0 0 1200 60"
    preserveAspectRatio="none"
    className={`absolute left-0 w-[200%] h-full ${className}`}
    style={style}
    aria-hidden="true"
  >
    <path d={WAVE_PATH} />
  </svg>
);

// Page background: soft gradient, floating blurred blobs and waves along the bottom.
// Uses palette colors, so it follows light/dark mode automatically.
export const WaterBackground: React.FC = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
    <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-slate-50 to-cyan-50" />
    <div className="aiya-float absolute -top-24 -left-24 w-80 h-80 rounded-full bg-sky-200/40 blur-3xl" />
    <div
      className="aiya-float absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-cyan-200/30 blur-3xl"
      style={{ animationDelay: '-5s' }}
    />
    <div
      className="aiya-float absolute bottom-24 left-1/4 w-72 h-72 rounded-full bg-blue-200/25 blur-3xl"
      style={{ animationDelay: '-9s' }}
    />
    {/* Waves at the bottom of the screen */}
    <div className="absolute bottom-0 left-0 right-0 h-24 overflow-hidden">
      <Wave className="aiya-wave-slow fill-sky-200/40 bottom-0" style={{ height: '100%' }} />
      <Wave className="aiya-wave fill-cyan-200/40 bottom-0" style={{ height: '70%', animationDelay: '-3s' }} />
    </div>
  </div>
);

// Little rising bubbles; place inside a `relative overflow-hidden` container.
export const Bubbles: React.FC<{ count?: number; className?: string }> = ({ count = 6, className = 'bg-white/60' }) => (
  <>
    {Array.from({ length: count }, (_, i) => {
      const size = 4 + ((i * 7) % 7);
      return (
        <span
          key={i}
          aria-hidden="true"
          className={`aiya-bubble absolute bottom-2 rounded-full ${className}`}
          style={{
            left: `${12 + ((i * 37) % 76)}%`,
            width: size,
            height: size,
            animationDelay: `${-(i * 0.8)}s`,
            animationDuration: `${3.5 + (i % 3)}s`,
          }}
        />
      );
    })}
  </>
);
