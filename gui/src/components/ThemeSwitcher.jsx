/**
 * ThemeSwitcher — compact theme + text size selector for sidebar footer
 * Shows theme toggle (OG / Velvet) and text size buttons (S / M / L)
 */
import { useTheme } from '../lib/theme';
import { Palette, Type, Sun, Moon, Monitor } from 'lucide-react';

const DARK_MODE_ICONS = { system: Monitor, light: Sun, dark: Moon };

/** Compact theme, text size, and light/dark selector for sidebar footer. */
export default function ThemeSwitcher() {
  const { theme, setTheme, textSize, setTextSize, darkMode, setDarkMode, themes, textSizes, darkModes } = useTheme();

  return (
    <div className="space-y-2">
      {/* Theme selector */}
      <div className="flex items-center gap-2">
        <Palette size={14} className="text-gray-500 shrink-0" />
        <div className="flex flex-1 rounded-md overflow-hidden border border-gray-700">
          {Object.entries(themes).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              title={themes[key].description}
              className={`flex-1 px-2 py-1 text-xs font-medium transition-colors ${
                theme === key
                  ? 'bg-podbit-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Dark mode selector */}
      <div className="flex items-center gap-2">
        <Sun size={14} className="text-gray-500 shrink-0" />
        <div className="flex flex-1 rounded-md overflow-hidden border border-gray-700">
          {Object.entries(darkModes).map(([key, { label }]) => {
            const Icon = DARK_MODE_ICONS[key];
            return (
              <button
                key={key}
                onClick={() => setDarkMode(key)}
                title={darkModes[key].description}
                className={`flex-1 px-2 py-1 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                  darkMode === key
                    ? 'bg-podbit-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                <Icon size={11} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Text size selector */}
      <div className="flex items-center gap-2">
        <Type size={14} className="text-gray-500 shrink-0" />
        <div className="flex flex-1 rounded-md overflow-hidden border border-gray-700">
          {Object.entries(textSizes).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setTextSize(key)}
              title={textSizes[key].description}
              className={`flex-1 px-2 py-1 text-xs font-medium transition-colors ${
                textSize === key
                  ? 'bg-podbit-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
