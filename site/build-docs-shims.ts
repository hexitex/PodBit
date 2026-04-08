/**
 * React Router DOM shim for static HTML rendering.
 * Replaces <Link to="/help/graph"> with <a href="#doc-graph" data-doc="graph">
 */
import React from 'react';

/** Renders an anchor that maps /help/:id to #doc-:id for static docs. */
export function Link({ to, children, className, ...rest }: any) {
  const match = (to as string).match(/^\/help\/(.+)/);
  const docId = match ? match[1] : (to as string).replace(/^\//, '');
  return React.createElement('a', {
    href: `#doc-${docId}`,
    'data-doc': docId,
    className: `docs-link-internal ${className || ''}`.trim(),
    ...rest,
  }, children);
}

/** Returns a static location object for server-side rendering (always /help/overview). */
export function useLocation() {
  return { pathname: '/help/overview', search: '', hash: '', state: null, key: 'default' };
}

/** No-op navigate for static build. */
export function useNavigate() {
  return () => {};
}

/** Returns empty params for static build. */
export function useParams() {
  return {};
}

/** Returns empty search params tuple for static build. */
export function useSearchParams() {
  return [new URLSearchParams(), () => {}];
}

/** Renders nothing (no nested routes in static docs). */
export function Outlet() {
  return null;
}

/** NavLink shim delegates to Link for static docs. */
export function NavLink(props: any) {
  return Link(props);
}
