// Build a smooth SVG path (Catmull-Rom → cubic bézier) through points, so the
// hand-drawn SVG line charts curve like the Chart.js ones (tension 0.35) and
// the d3 curveMonotoneX charts — without pulling d3 into those routes.
export function smoothLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) {
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    // Clamp the handles inside the segment: with uneven spacing (a one-day step
    // next to a month-long one) they'd overshoot sideways and the line would loop.
    const c1x = Math.min(p1.x + (p2.x - p0.x) / 6, p2.x);
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = Math.max(p2.x - (p3.x - p1.x) / 6, p1.x);
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
