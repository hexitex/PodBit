import { useState, useEffect } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';

const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

function CustomTooltip({ active, payload, label, layerColors }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5 border-b border-gray-100 dark:border-gray-700 pb-1">{label}</div>
      {payload.map((entry) => {
        const raw = entry.payload?.[`_raw_${entry.name}`];
        const displayVal = raw !== undefined ? raw : entry.value;
        return (
          <div key={entry.name} className="flex items-center gap-2 py-0.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: layerColors[entry.name] || entry.color }}
            />
            <span className="text-gray-500 dark:text-gray-400 min-w-[60px]">{entry.name}</span>
            <span className="text-gray-800 dark:text-gray-200 font-mono font-medium ml-auto">
              {typeof displayVal === 'number' ? displayVal.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : displayVal}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Reusable radar/spider chart for overlaying multiple parameter profiles.
 *
 * @param {Object} props
 * @param {Array} props.layers - [{ name, data: { key: value }, color?, active? }]
 * @param {Array} props.axes - [{ key, label, max }]
 * @param {number} [props.size=250] - Chart height in px
 * @param {boolean} [props.showLegend=true] - Show clickable legend
 * @param {string} [props.className] - Additional CSS classes
 */
export default function RadarProfile({ layers = [], axes = [], size = 250, showLegend = true, className = '' }) {
  const [hidden, setHidden] = useState(new Set());
  const [isDark, setIsDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Listen for dark mode changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!layers.length || !axes.length) return null;

  // Assign default colors
  const coloredLayers = layers.map((l, i) => ({
    ...l,
    color: l.color || COLORS[i % COLORS.length],
    active: l.active !== false,
  }));

  const layerColors = {};
  for (const l of coloredLayers) layerColors[l.name] = l.color;

  // Transform into Recharts data: one object per axis
  // Store both normalized (for chart shape) and raw (for tooltip display)
  const data = axes.map(({ key, label, max }) => {
    const point = { axis: label };
    for (const layer of coloredLayers) {
      const raw = layer.data?.[key] ?? 0;
      point[layer.name] = max > 0 ? raw / max : raw;
      point[`_raw_${layer.name}`] = raw;
    }
    return point;
  });

  const toggle = (name) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const visibleLayers = coloredLayers.filter(l => l.active && !hidden.has(l.name));

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={size}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke={isDark ? '#374151' : '#cbd5e1'} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 11, fill: isDark ? '#d1d5db' : '#334155', fontWeight: 500 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 1]}
            tick={false}
            tickCount={5}
            axisLine={false}
          />
          {visibleLayers.map((layer) => (
            <Radar
              key={layer.name}
              name={layer.name}
              dataKey={layer.name}
              stroke={layer.color}
              fill={layer.color}
              fillOpacity={0.2}
              strokeWidth={2}
              dot={{ r: 3, fill: layer.color }}
            />
          ))}
          <Tooltip content={<CustomTooltip layerColors={layerColors} />} />
        </RadarChart>
      </ResponsiveContainer>

      {showLegend && coloredLayers.length > 1 && (
        <div className="flex flex-wrap justify-center gap-3 mt-1">
          {coloredLayers.filter(l => l.active).map((layer) => {
            const isHidden = hidden.has(layer.name);
            return (
              <button
                key={layer.name}
                onClick={() => toggle(layer.name)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-all hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  isHidden ? 'opacity-40 line-through' : 'opacity-100'
                }`}
                title={isHidden ? `Show ${layer.name}` : `Hide ${layer.name}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="text-slate-600 dark:text-slate-300">{layer.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
