import { useCallback, useMemo } from 'react';
import { SkipBack, Rewind, Play, Pause, FastForward, Radio } from 'lucide-react';
import { SPEED_OPTIONS } from './constants';

const BTN = 'p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30';
const BTN_ACTIVE = 'p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400';

/**
 * VCR playback controls + timeline scrubber.
 */
export default function PlaybackControls({
  mode,
  speed,
  cursorTime,
  timeRange,
  events,
  onModeChange,
  onSpeedChange,
  onSeek,
  onStepForward,
  onStepBackward,
  onGoLive,
}) {
  const isPlaying = mode === 'playing';
  const isLive = mode === 'live';

  const togglePlay = useCallback(() => {
    if (isLive) {
      onModeChange('paused');
    } else if (isPlaying) {
      onModeChange('paused');
    } else {
      onModeChange('playing');
    }
  }, [isLive, isPlaying, onModeChange]);

  const goToStart = useCallback(() => {
    if (events.length > 0) {
      onSeek(events[0].time);
    }
  }, [events, onSeek]);

  // Event density for the timeline background (5-minute buckets)
  const densityBuckets = useMemo(() => {
    const bucketSize = 5 * 60 * 1000; // 5 min
    const range = timeRange.end - timeRange.start;
    if (range <= 0 || events.length === 0) return [];

    const bucketCount = Math.max(Math.ceil(range / bucketSize), 1);
    const buckets = new Array(bucketCount).fill(0);

    for (const evt of events) {
      const idx = Math.min(
        Math.floor((evt.time - timeRange.start) / bucketSize),
        bucketCount - 1,
      );
      if (idx >= 0) buckets[idx]++;
    }

    const max = Math.max(...buckets, 1);
    return buckets.map((count) => count / max);
  }, [events, timeRange]);

  // Cursor position as percentage
  const range = timeRange.end - timeRange.start;
  const cursorPct = range > 0
    ? Math.max(0, Math.min(100, ((cursorTime - timeRange.start) / range) * 100))
    : 100;

  const formatTime = (ms) => {
    const d = new Date(ms);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="mt-4 space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-2">
        {/* Transport buttons */}
        <div className="flex items-center gap-1">
          <button
            className={BTN}
            onClick={goToStart}
            title="Go to start"
          >
            <SkipBack size={16} className="text-gray-500 dark:text-gray-400" />
          </button>
          <button
            className={BTN}
            onClick={onStepBackward}
            title="Previous event"
          >
            <Rewind size={16} className="text-gray-500 dark:text-gray-400" />
          </button>
          <button
            className={`${isPlaying ? BTN_ACTIVE : BTN} px-3`}
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={16} />
            ) : (
              <Play size={16} className="text-gray-500 dark:text-gray-400" />
            )}
          </button>
          <button
            className={BTN}
            onClick={onStepForward}
            title="Next event"
          >
            <FastForward size={16} className="text-gray-500 dark:text-gray-400" />
          </button>
          <button
            className={`${isLive ? BTN_ACTIVE : BTN} flex items-center gap-1.5`}
            onClick={onGoLive}
            title="Go live"
          >
            <Radio size={14} />
            {isLive && (
              <span className="text-xs font-medium">Live</span>
            )}
          </button>
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-1">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                speed === opt.value
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              onClick={() => onSpeedChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline scrubber */}
      <div className="relative">
        {/* Time labels */}
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1 font-mono">
          <span>{formatTime(timeRange.start)}</span>
          <span>{isLive ? 'Now' : formatTime(cursorTime)}</span>
          <span>{formatTime(timeRange.end)}</span>
        </div>

        {/* Density histogram background */}
        <div className="relative h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
          <div className="absolute inset-0 flex items-end">
            {densityBuckets.map((density, i) => (
              <div
                key={i}
                className="flex-1"
                style={{
                  height: `${Math.max(density * 100, 2)}%`,
                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                }}
              />
            ))}
          </div>

          {/* Cursor line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-purple-500 dark:bg-purple-400 z-10"
            style={{ left: `${cursorPct}%` }}
          >
            {/* Cursor handle */}
            <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-purple-500 dark:bg-purple-400 rounded-full border-2 border-white dark:border-gray-900 shadow" />
          </div>

          {/* Click to seek overlay */}
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const time = timeRange.start + pct * range;
              onSeek(time);
            }}
          />
        </div>
      </div>
    </div>
  );
}
