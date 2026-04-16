import React from 'react';

export default function DonutChart({ carb, protein, fat }) {
  const cx = 60, cy = 60, R = 45, SW = 22, C = 2 * Math.PI * R;
  const lenC = (carb / 100) * C;
  const lenP = (protein / 100) * C;
  const lenF = (fat / 100) * C;
  const startC = 0, startP = carb * 3.6, startF = (carb + protein) * 3.6;

  function mid(sd, sp, r) {
    const m = (sd + sp / 2) * (Math.PI / 180);
    return { x: (cx + r * Math.sin(m)).toFixed(1), y: (cy - r * Math.cos(m)).toFixed(1) };
  }

  const lC = mid(startC, carb * 3.6, R), lP = mid(startP, protein * 3.6, R), lF = mid(startF, fat * 3.6, R);

  const seg = (len, color, rot) => (
    <circle 
      cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={SW}
      strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
      transform={`rotate(${rot},${cx},${cy})`} 
      className="transition-[stroke-dasharray] duration-1000 ease-out"
    />
  );

  return (
    <svg viewBox="0 0 120 120" width="100" height="100" className="block">
      {seg(lenF, "#e8a126", startF - 90, 0.4)}
      {seg(lenP, "#e05a2b", startP - 90, 0.2)}
      {seg(lenC, "#3385ff", startC - 90, 0)}
      <circle cx={cx} cy={cy} r="27" fill="#fff" />
      {[[lC, carb], [lP, protein], [lF, fat]].map(([l, v], i) => (
        <text 
          key={i} 
          x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central"
          className="font-pretendard text-[10px] font-semibold fill-white transition-opacity duration-300 opacity-100"
        >
          {v}%
        </text>
      ))}
    </svg>
  );
}
