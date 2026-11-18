import { classifyCpcbAqi } from '../lib/aqi.ts';

interface AqiStatusTextProps {
  aqi: number | null;
  compact?: boolean;
}

export function AqiStatusText({ aqi, compact = false }: AqiStatusTextProps) {
  const meta = classifyCpcbAqi(aqi);

  return (
    <span
      className={`inline-flex items-center gap-2 font-medium ${meta.textClass} ${
        compact ? 'text-xs' : 'text-sm'
      }`}
    >
      <span
        className="w-2.5 h-2.5 rounded-xs shrink-0 ring-1 ring-white/15"
        style={{ backgroundColor: meta.accentHex }}
        aria-hidden="true"
      />
      <span>{meta.category}</span>
      <span className="text-slate-400 font-normal font-mono tabular-nums">
        ({meta.rangeLabel})
      </span>
    </span>
  );
}
