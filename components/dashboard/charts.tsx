// Pure SVG chart components (server-renderable), ported from the Meridian design.

export function RevenueExpenseBars({
  rev,
  exp,
  months,
  width = 640,
  height = 240,
}: {
  rev: number[];
  exp: number[];
  months: string[];
  width?: number;
  height?: number;
}) {
  const pad = { t: 14, r: 10, b: 30, l: 40 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = 16;
  const ticks = [0, 4, 8, 12, 16];
  const gw = iw / months.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: "block" }}
    >
      {ticks.map((t) => {
        const y = pad.t + ih - (t / max) * ih;
        return (
          <g key={`t${t}`}>
            <line
              x1={pad.l}
              y1={y}
              x2={width - pad.r}
              y2={y}
              stroke="#eef1f5"
              strokeWidth={1}
            />
            <text
              x={pad.l - 8}
              y={y + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="#93a0b4"
            >
              {t}
            </text>
          </g>
        );
      })}
      {months.map((m, i) => {
        const cx = pad.l + gw * i + gw / 2;
        const bw = Math.min(gw * 0.3, 12);
        const rH = (rev[i] / max) * ih;
        const eH = (exp[i] / max) * ih;
        return (
          <g key={m}>
            <rect
              x={cx - bw - 1.5}
              y={pad.t + ih - rH}
              width={bw}
              height={rH}
              rx={2}
              fill="#2f6bf6"
            />
            <rect
              x={cx + 1.5}
              y={pad.t + ih - eH}
              width={bw}
              height={eH}
              rx={2}
              fill="#c8d3e4"
            />
            <text
              x={cx}
              y={height - 10}
              textAnchor="middle"
              fontSize={10}
              fill="#93a0b4"
            >
              {m}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ pct = 67.6, size = 150 }: { pct?: number; size?: number }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <svg viewBox="0 0 160 160" width={size} height={size}>
      <circle cx={80} cy={80} r={r} fill="none" stroke="#eef1f5" strokeWidth={16} />
      <circle
        cx={80}
        cy={80}
        r={r}
        fill="none"
        stroke="#2f6bf6"
        strokeWidth={16}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 80 80)"
      />
      <text
        x={80}
        y={76}
        textAnchor="middle"
        fontSize={30}
        fontWeight={600}
        fill="#16202e"
      >
        {pct}%
      </text>
      <text x={80} y={96} textAnchor="middle" fontSize={11} fill="#8592a6">
        utilized
      </text>
    </svg>
  );
}
