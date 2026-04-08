import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the element matching the URL hash after navigation.
 * Retries with increasing delays to handle async data loading.
 * Expands collapsed CategoryGroups and CollapsibleSections as needed.
 */
export function useScrollToHash() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) return;

    const id = hash.replace('#', '');
    let attempts = 0;
    const maxAttempts = 25;
    let timer = null;

    const tryScroll = () => {
      const el = document.getElementById(id);
      if (!el) {
        if (++attempts < maxAttempts) {
          // Backoff: 200ms, 200ms, 300ms, 300ms, 400ms, ...
          const delay = 200 + Math.floor(attempts / 2) * 100;
          timer = setTimeout(tryScroll, delay);
        }
        return;
      }

      // Expand any collapsed CategoryGroup ancestors
      let parent = el.parentElement;
      while (parent) {
        if (parent.dataset?.categoryCollapsed === 'true') {
          const toggle = parent.querySelector('[data-category-toggle]');
          if (toggle) toggle.click();
        }
        parent = parent.parentElement;
      }

      // If the target itself is a collapsed CollapsibleSection, expand it
      if (el.dataset?.collapsed === 'true') {
        const toggle = el.querySelector('[data-collapsible-toggle]');
        if (toggle) toggle.click();
      }

      // If the target is inside a collapsed CollapsibleSection, expand it
      const collapsible = el.closest('[data-collapsible]');
      if (collapsible && collapsible !== el && collapsible.dataset.collapsed === 'true') {
        const toggle = collapsible.querySelector('[data-collapsible-toggle]');
        if (toggle) toggle.click();
      }

      // Delay scroll to let expansions render
      setTimeout(() => scrollToEl(el), 250);
    };

    const scrollToEl = (el) => {
      // Highlight briefly
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2'), 3000);

      // Scroll — try the main overflow container first
      const scrollParent = el.closest('main') || el.closest('[class*="overflow-auto"]');
      if (scrollParent) {
        const elRect = el.getBoundingClientRect();
        const parentRect = scrollParent.getBoundingClientRect();
        const offset = elRect.top - parentRect.top - 80;
        scrollParent.scrollBy({ top: offset, behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    // Start after a short initial delay for first render
    timer = setTimeout(tryScroll, 100);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [hash, pathname]);
}
