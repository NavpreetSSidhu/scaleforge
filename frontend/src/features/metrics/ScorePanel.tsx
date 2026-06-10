import { AnimatePresence, motion } from 'framer-motion';
import { gradeMeta, overallScore } from '@/lib/score';
import { useArchitectureStore } from '@/store/architectureStore';
import type { Scores } from '@/types/domain';

interface Dim {
  key: string;
  label: string;
  short: string;
  value: number;
}

function dimensions(scores: Scores): Dim[] {
  return [
    { key: 'performance', label: 'Performance', short: 'Perf', value: scores.performance },
    { key: 'reliability', label: 'Reliability', short: 'Rel', value: scores.reliability },
    { key: 'scalability', label: 'Scalability', short: 'Scale', value: scores.scalability },
    { key: 'costEfficiency', label: 'Cost Efficiency', short: 'Cost', value: scores.costEfficiency },
    { key: 'maintainability', label: 'Maintainability', short: 'Maint', value: scores.maintainability },
  ];
}

function barColor(v: number): string {
  if (v >= 85) return '#2fd39e';
  if (v >= 70) return '#8fd14f';
  if (v >= 55) return '#f5b14b';
  return '#ff6058';
}

export function ScorePanel({ scores }: { scores: Scores }) {
  const view = useArchitectureStore((s) => s.scoreView);
  const dims = dimensions(scores);

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {view === 'cards' && <Cards dims={dims} />}
          {view === 'gauges' && <Gauges dims={dims} />}
          {view === 'radar' && <Radar dims={dims} grade={scores.overallGrade} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Cards({ dims }: { dims: Dim[] }) {
  return (
    <div className="space-y-2.5">
      {dims.map((d) => (
        <div key={d.key}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink-muted">{d.label}</span>
            <span className="font-mono font-medium text-ink">{d.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-line">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${d.value}%`, backgroundColor: barColor(d.value) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Gauges({ dims }: { dims: Dim[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {dims.map((d) => {
        const color = barColor(d.value);
        const r = 18;
        const c = 2 * Math.PI * r;
        return (
          <div key={d.key} className="flex flex-col items-center gap-1">
            <svg width="56" height="56" viewBox="0 0 48 48" className="-rotate-90">
              <circle cx="24" cy="24" r={r} fill="none" stroke="#232936" strokeWidth="5" />
              <circle
                cx="24"
                cy="24"
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c - (c * d.value) / 100}
              />
              <text
                x="24"
                y="25"
                textAnchor="middle"
                dominantBaseline="middle"
                className="rotate-90 fill-ink font-mono text-[11px] font-semibold"
                transform="rotate(90 24 24)"
              >
                {d.value}
              </text>
            </svg>
            <span className="text-[10px] uppercase tracking-wider text-ink-faint">{d.short}</span>
          </div>
        );
      })}
    </div>
  );
}

function Radar({ dims, grade }: { dims: Dim[]; grade: string }) {
  const size = 200;
  const center = size / 2;
  const radius = 74;
  const n = dims.length;
  const meta = gradeMeta(grade);

  const point = (i: number, value: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (value / 100) * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };
  const axis = (i: number) => point(i, 100);

  const polygon = dims.map((d, i) => point(i, d.value).join(',')).join(' ');
  const rings = [25, 50, 75, 100];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={dims.map((_, i) => point(i, ring).join(',')).join(' ')}
            fill="none"
            stroke="#232936"
            strokeWidth="1"
          />
        ))}
        {dims.map((_, i) => {
          const [x, y] = axis(i);
          return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#232936" strokeWidth="1" />;
        })}
        <polygon points={polygon} fill={`${meta.color}33`} stroke={meta.color} strokeWidth="1.5" />
        {dims.map((d, i) => {
          const [x, y] = axis(i);
          const lx = center + (x - center) * 1.16;
          const ly = center + (y - center) * 1.16;
          return (
            <text
              key={d.key}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-ink-faint text-[9px] uppercase"
            >
              {d.short}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 text-center">
        <div className="font-mono text-lg font-bold" style={{ color: meta.color }}>
          {overallScore({
            performance: dims[0].value,
            reliability: dims[1].value,
            scalability: dims[2].value,
            costEfficiency: dims[3].value,
            maintainability: dims[4].value,
            overallGrade: grade,
          })}
          /100
        </div>
        <div className="text-[10px] uppercase tracking-wider text-ink-faint">{meta.label}</div>
      </div>
    </div>
  );
}
