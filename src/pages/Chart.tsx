import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { fmtN, fmtShort, parse } from '../lib';
import { Empty } from '../ui';

type Point = { date: string; value: number };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Single-series time line with an optional dashed target line and a hover readout. */
export function LineChart(p: { points: Point[]; target?: number | null; unit?: string; height?: number; compact?: boolean; color?: string; zero?: boolean; rings?: boolean }) {
  const { points, target, unit = '', height = 150, compact, color = '#1673ff' } = p;
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = compact ? { l: 4, r: 8, t: 8, b: 4 } : { l: 40, r: 14, t: 12, b: 24 };

  const xs = points.map((d) => parse(d.date).getTime());
  const vals = [...points.map((d) => d.value), ...(target != null ? [target] : []), ...(p.zero ? [0] : [])];
  const min = Math.min(...vals), max = Math.max(...vals, p.zero ? 1 : -Infinity);
  const margin = (max - min || Math.abs(max) || 1) * 0.12;
  const lo = p.zero ? 0 : min - margin, hi = max + margin;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const X = (t: number) => pad.l + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const line = points.map((d, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(d.value).toFixed(1)}`).join('');
  const base = height - pad.b;
  const ticks = p.zero ? [0, max / 2, max] : [min, (min + max) / 2, max];

  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * w; // rect is in zoomed pixels
    setHover(xs.reduce((best, t, i) => (Math.abs(X(t) - mx) < Math.abs(X(xs[best]) - mx) ? i : best), 0));
  };
  const hp = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="chartbox" style={{ height }}>
      {w > 0 && points.length > 0 && (
        <svg width={w} height={height} onMouseMove={move} onMouseLeave={() => setHover(null)}>
          {!compact && ticks.map((v, i) => (min === max && !p.zero && i ? null : (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} className="gridline" />
              <text x={pad.l - 8} y={Y(v) + 4} textAnchor="end" className="axis">{fmtN(+v.toFixed(1))}{p.zero ? unit : ''}</text>
            </g>
          )))}
          {!compact && (p.rings ? points : [points[0], points[points.length - 1]]).map((d, i, a) => (
            <text key={d.date} x={X(parse(d.date).getTime())} y={height - 6} textAnchor={p.rings ? 'middle' : i ? 'end' : 'start'} className="axis">{a.length > 1 || !i ? fmtShort(d.date) : ''}</text>
          ))}
          {target != null && <line x1={pad.l} x2={w - pad.r} y1={Y(target)} y2={Y(target)} className="target" />}
          {target != null && !compact && <text x={w - pad.r} y={Y(target) - 5} textAnchor="end" className="axis">Mục tiêu {fmtN(target)}</text>}
          {points.length > 1 && <path d={`${line}L${X(x1)} ${base}L${X(x0)} ${base}Z`} fill={color} opacity=".08" />}
          <path d={line} className="series" stroke={color} />
          {p.rings ? points.map((d, i) => <circle key={d.date} cx={X(xs[i])} cy={Y(d.value)} r="4" className="ring" stroke={color} />)
            : <circle cx={X(x1)} cy={Y(points[points.length - 1].value)} r="4.5" className="dot" fill={color} />}
          {hp && <line x1={X(xs[hover!])} x2={X(xs[hover!])} y1={pad.t} y2={base} className="cross" />}
          {hp && <circle cx={X(xs[hover!])} cy={Y(hp.value)} r="4.5" className="dot" fill={color} />}
        </svg>
      )}
      {hp && (
        <div className="tip" style={{ left: Math.min(Math.max(X(xs[hover!]), 50), w - 50), top: Math.max(Y(hp.value) - 44, 0) }}>
          <b>{fmtN(hp.value)} {unit}</b>{fmtShort(hp.date)}/{hp.date.slice(0, 4)}
        </div>
      )}
      {!points.length && <Empty>Chưa có số liệu.</Empty>}
    </div>
  );
}
