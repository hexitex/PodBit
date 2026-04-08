import { useRef, useEffect } from 'react';
import { useTheme } from '../lib/theme';

/** Help page: iframe to static docs with theme sync. */
export default function Help() {
  const iframeRef = useRef(null);
  const { theme, isDark, textSize } = useTheme();

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const send = () => {
      iframe.contentWindow?.postMessage(
        { type: 'podbit-theme', theme, isDark, textSize },
        '*'
      );
    };

    // Send on theme change — iframe may already be loaded
    send();

    // Also send once the iframe loads (first paint)
    iframe.addEventListener('load', send);
    return () => iframe.removeEventListener('load', send);
  }, [theme, isDark, textSize]);

  return (
    <iframe
      ref={iframeRef}
      src="/docs.html"
      className="w-full h-full border-0"
      title="Podbit Documentation"
    />
  );
}
