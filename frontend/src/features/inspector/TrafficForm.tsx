import { useArchitectureStore } from '@/store/architectureStore';
import type { TrafficProfile } from '@/types/domain';

const fields: { key: keyof TrafficProfile; label: string; step?: number }[] = [
  { key: 'dailyActiveUsers', label: 'Daily Active Users' },
  { key: 'monthlyActiveUsers', label: 'Monthly Active Users' },
  { key: 'concurrentUsers', label: 'Concurrent Users' },
  { key: 'requestsPerUserMin', label: 'Requests / User / Min', step: 0.1 },
  { key: 'peakTrafficMultiplier', label: 'Peak Multiplier', step: 0.1 },
];

export function TrafficForm() {
  const { traffic, setTraffic } = useArchitectureStore();

  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(({ key, label, step }) => (
        <label key={key} className="flex flex-col gap-1.5 text-sm">
          <span className="text-[11px] text-ink-faint">{label}</span>
          <input
            type="number"
            min={0}
            step={step ?? 1}
            value={traffic[key]}
            onChange={(e) => setTraffic({ [key]: Number(e.target.value) })}
            className="input font-mono"
          />
        </label>
      ))}
    </div>
  );
}
