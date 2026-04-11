import { useRef, useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as d3 from 'd3';
import { resonance, partitions as partitionsApi } from '../lib/api';
import { useTheme } from '../lib/theme';
import { utcMs } from '../lib/datetime';

const TYPE_COLORS = {
  seed: '#10b981',
  synthesis: '#0ea5e9',
  voiced: '#8b5cf6',
  breakthrough: '#f59e0b',
  possible: '#fb923c',
  question: '#ef4444',
  answered: '#22c55e',
  raw: '#6b7280',
  elite_verification: '#eab308',
};

const TYPE_LABELS = {
  seed: 'Seed',
  synthesis: 'Synthesis',
  voiced: 'Voiced',
  breakthrough: 'Breakthrough',
  possible: 'Possible',
  question: 'Open Question',
  answered: 'Answered',
  raw: 'Raw',
  elite_verification: 'Elite',
};

const INTERACTION_STYLES = {
  excluded:  { stroke: '#f97316', dasharray: '6 3', width: 1, glow: true },
  feedback:  { stroke: '#22c55e', dasharray: null,  width: 1, glow: false },
  feedback0: { stroke: '#eab308', dasharray: null,  width: 1, glow: false },
  feedbackN: { stroke: '#ef4444', dasharray: null,  width: 1, glow: false },
  viewed:    { stroke: '#a78bfa', dasharray: '5 3', width: 1, glow: true },
};

const GROUP_FIELDS = [
  { value: 'domain', label: 'Domain' },
  { value: 'type', label: 'Node Type' },
  { value: 'keyword', label: 'Keyword' },
  { value: 'trajectory', label: 'Trajectory' },
  { value: 'contributor', label: 'Contributor' },
];

const SIZE_FIELDS = [
  { value: 'weight', label: 'Weight' },
  { value: 'salience', label: 'Salience' },
  { value: 'age', label: 'Age' },
  { value: 'children', label: 'Children' },
  { value: 'ancestors', label: 'Ancestors' },
];

function getInteractionStyle(nodeData, viewedNodes) {
  if (nodeData.excluded) return INTERACTION_STYLES.excluded;
  if (nodeData.feedback_rating === 1) return INTERACTION_STYLES.feedback;
  if (nodeData.feedback_rating === 0) return INTERACTION_STYLES.feedback0;
  if (nodeData.feedback_rating === -1) return INTERACTION_STYLES.feedbackN;
  if (viewedNodes?.has(nodeData.id)) return INTERACTION_STYLES.viewed;
  return null;
}

/** Resolve effective visual type — splits answered questions into their own group. */
function getEffectiveType(node) {
  if (node.type === 'question' && node.metadata?.answered) return 'answered';
  return node.type;
}

function getNodeField(node, field, keywordMap) {
  switch (field) {
    case 'domain': return node.domain || 'unassigned';
    case 'type': return TYPE_LABELS[getEffectiveType(node)] || node.type || 'unknown';
    case 'keyword': return keywordMap?.get(node.id) || 'untagged';
    case 'trajectory': return node.trajectory || 'unclassified';
    case 'contributor': return node.contributor || 'unknown';
    default: return 'unknown';
  }
}

/**
 * Compute top-N keywords across all nodes and assign each node to its
 * highest-frequency keyword. Returns a Map<nodeId, keywordGroup>.
 */
function computeKeywordGroups(nodes, topN = 20) {
  const freq = {};
  for (const node of nodes) {
    if (!node.keywords?.length) continue;
    for (const kw of node.keywords) {
      freq[kw] = (freq[kw] || 0) + 1;
    }
  }

  const topKeywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([kw]) => kw);

  const topSet = new Set(topKeywords);

  const assignments = new Map();
  for (const node of nodes) {
    if (!node.keywords?.length) {
      assignments.set(node.id, 'untagged');
      continue;
    }
    let bestKw = null;
    let bestFreq = -1;
    for (const kw of node.keywords) {
      if (topSet.has(kw) && (freq[kw] || 0) > bestFreq) {
        bestKw = kw;
        bestFreq = freq[kw];
      }
    }
    assignments.set(node.id, bestKw || 'other');
  }

  return assignments;
}

/**
 * Split text into lines that fit within maxChars, breaking at word boundaries.
 * Returns at most maxLines lines, truncating the last with '...' if needed.
 */
function wordWrap(text, maxChars, maxLines = 4) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      // If single word exceeds maxChars, truncate it
      currentLine = word.length > maxChars ? word.slice(0, maxChars - 1) + '\u2026' : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  if (lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines);
    truncated[maxLines - 1] = truncated[maxLines - 1].slice(0, maxChars - 1) + '\u2026';
    return truncated;
  }
  return lines;
}

/**
 * Build hierarchy from flat nodes, grouped by configurable fields.
 */
function buildHierarchy(nodes, groupBy, subGroup, sizeBy, keywordMap) {
  // Precompute normalization ranges for count/age-based sizing
  let maxChildren = 0, maxAncestors = 0, minAge = Infinity, maxAge = 0;
  if (sizeBy === 'children' || sizeBy === 'ancestors' || sizeBy === 'age') {
    const now = Date.now();
    for (const n of nodes) {
      if (n.childCount > maxChildren) maxChildren = n.childCount;
      if (n.ancestorCount > maxAncestors) maxAncestors = n.ancestorCount;
      if (n.createdAt) {
        const age = now - utcMs(n.createdAt);
        if (age < minAge) minAge = age;
        if (age > maxAge) maxAge = age;
      }
    }
  }

  const getValue = (node) => {
    if (sizeBy === 'children') {
      return maxChildren > 0 ? 0.1 + (node.childCount / maxChildren) * 0.9 : 0.5;
    }
    if (sizeBy === 'ancestors') {
      return maxAncestors > 0 ? 0.1 + (node.ancestorCount / maxAncestors) * 0.9 : 0.5;
    }
    if (sizeBy === 'age') {
      if (!node.createdAt || maxAge <= minAge) return 0.5;
      const age = Date.now() - utcMs(node.createdAt);
      return 0.1 + ((age - minAge) / (maxAge - minAge)) * 0.9;
    }
    const v = sizeBy === 'salience' ? node.salience : node.weight;
    return Math.max(0.1, v || 0.5);
  };

  const effectiveSubGroup = (subGroup === groupBy || subGroup === 'none') ? null : subGroup;

  if (!effectiveSubGroup) {
    const groupMap = {};
    for (const node of nodes) {
      const group = getNodeField(node, groupBy, keywordMap);
      if (!groupMap[group]) groupMap[group] = [];
      groupMap[group].push(node);
    }
    return {
      name: 'Knowledge Graph',
      children: Object.entries(groupMap).map(([group, groupNodes]) => ({
        name: group,
        _isGroup: true,
        _groupField: groupBy,
        _rawType: groupBy === 'type' ? getEffectiveType(groupNodes[0]) : null,
        children: groupNodes.map(n => ({
          name: n.content || '',
          value: getValue(n),
          _node: n,
        })),
      })),
    };
  }

  const groupMap = {};
  for (const node of nodes) {
    const group = getNodeField(node, groupBy, keywordMap);
    const sub = getNodeField(node, effectiveSubGroup, keywordMap);
    if (!groupMap[group]) groupMap[group] = {};
    if (!groupMap[group][sub]) groupMap[group][sub] = [];
    groupMap[group][sub].push(node);
  }

  return {
    name: 'Knowledge Graph',
    children: Object.entries(groupMap).map(([group, subs]) => ({
      name: group,
      _isGroup: true,
      _groupField: groupBy,
      _rawType: groupBy === 'type' ? getEffectiveType(Object.values(subs).flat()[0]) : null,
      children: Object.entries(subs).map(([sub, subNodes]) => ({
        name: sub,
        _isGroup: true,
        _groupField: effectiveSubGroup,
        _rawType: effectiveSubGroup === 'type' ? getEffectiveType(subNodes[0]) : null,
        children: subNodes.map(n => ({
          name: n.content || '',
          value: getValue(n),
          _node: n,
        })),
      })),
    })),
  };
}

/** Force-directed graph of nodes by domain/type with zoom and node selection. */
export default function DomainGraph({ onSelectNode, limit = 200, filters = {}, viewedNodes }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const focusPathRef = useRef(null); // preserve zoom target across data refreshes
  const [groupBy, setGroupBy] = useState('domain');
  const [subGroup, setSubGroup] = useState('type');
  const [sizeBy, setSizeBy] = useState('weight');
  const [bridgeVis, setBridgeVis] = useState('hover'); // 'off' | 'hover' | 'all'
  const [bridgeMode, setBridgeMode] = useState(false); // bridge builder mode
  const [bridgeSource, setBridgeSource] = useState(null); // first domain selected for bridging
  const { isDark } = useTheme();
  const queryClient = useQueryClient();

  const { data: rawData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['resonance', 'graph', filters],
    queryFn: () => resonance.getGraph({ ...filters, limit: 3000 }),
    staleTime: 5 * 60_000,        // 5 minutes — graph doesn't need real-time updates
    refetchOnWindowFocus: true,    // refresh when user returns to tab
  });

  // Slice to requested limit client-side so the slider doesn't create separate cache entries
  const data = rawData && rawData.nodes
    ? { ...rawData, nodes: rawData.nodes.slice(0, limit) }
    : rawData;

  // Fetch partition/bridge data for bridge overlay (only used when grouped by domain)
  const { data: partitionData } = useQuery({
    queryKey: ['partitions', 'list'],
    queryFn: () => partitionsApi.list(),
    staleTime: 5 * 60_000,
    enabled: groupBy === 'domain',
  });
  const { data: bridgeData } = useQuery({
    queryKey: ['partitions', 'bridges'],
    queryFn: () => partitionsApi.listBridges(),
    staleTime: 5 * 60_000,
    enabled: groupBy === 'domain',
  });

  // Measure container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setDimensions({ width, height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build zoomable circle packing
  useEffect(() => {
    if (!data?.nodes?.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const { width: W, height: H } = dimensions;
    const size = Math.min(W, H);

    svg.selectAll('*').remove();

    const keywordMap = computeKeywordGroups(data.nodes);
    const hierarchyData = buildHierarchy(data.nodes, groupBy, subGroup, sizeBy, keywordMap);

    // Depth-based color for group circles
    const color = d3.scaleLinear()
      .domain([0, 3])
      .range(isDark ? ['hsl(220,15%,15%)', 'hsl(220,25%,32%)'] : ['hsl(220,20%,96%)', 'hsl(220,35%,80%)'])
      .interpolate(d3.interpolateHcl);

    // Pack layout
    const root = d3.pack()
      .size([size, size])
      .padding(d => d.depth === 0 ? 6 : d.depth === 1 ? 4 : 2)(
      d3.hierarchy(hierarchyData)
        .sum(d => d.value || 0)
        .sort((a, b) => (b.value || 0) - (a.value || 0))
    );

    svg
      .attr('viewBox', `-${W / 2} -${H / 2} ${W} ${H}`)
      .style('cursor', 'pointer')
      .style('background', color(0));

    // Circles (skip root)
    const node = svg.append('g')
      .selectAll('circle')
      .data(root.descendants().slice(1))
      .join('circle')
      .attr('fill', d => {
        if (d.children) return color(d.depth);
        const n = d.data._node;
        return n ? (TYPE_COLORS[getEffectiveType(n)] || '#9ca3af') : 'white';
      })
      .attr('fill-opacity', d => {
        if (d.children) return 1;
        const n = d.data._node;
        const salience = n?.salience ?? 0.5;
        return 0.4 + Math.min(1, salience) * 0.6;
      })
      .attr('stroke', d => {
        if (d.children) return isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
        const n = d.data._node;
        const interaction = n ? getInteractionStyle(n, viewedNodes) : null;
        if (interaction) return interaction.stroke;
        return isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';
      })
      .attr('stroke-width', d => {
        if (d.children) return 0.5;
        const n = d.data._node;
        const interaction = n ? getInteractionStyle(n, viewedNodes) : null;
        return interaction ? interaction.width : 1;
      })
      .attr('stroke-dasharray', d => {
        if (d.children) return null;
        const n = d.data._node;
        const interaction = n ? getInteractionStyle(n, viewedNodes) : null;
        return interaction?.dasharray || null;
      })
      .style('filter', d => {
        if (d.children) return null;
        const n = d.data._node;
        const interaction = n ? getInteractionStyle(n, viewedNodes) : null;
        return interaction?.glow ? `drop-shadow(0 0 4px ${interaction.stroke})` : null;
      })
      .on('mouseover', function (_event, d) {
        d3.select(this)
          .attr('stroke', isDark ? '#e2e8f0' : '#1e293b')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', null)
          .style('filter', isDark ? 'drop-shadow(0 0 4px rgba(226,232,240,0.5))' : 'drop-shadow(0 0 4px rgba(30,41,59,0.3))');
        // In hover mode, show bridges for this domain group
        if (bridgeVisRef.current === 'hover' && d.children && d.depth === 1 && d.data._groupField === 'domain') {
          const domName = d.data.name;
          bridgeG.selectAll('.bridge-arc')
            .style('opacity', bd => (bd.domainA === domName || bd.domainB === domName) ? 1 : 0);
        }
      })
      .on('mouseout', function (_event, d) {
        if (d.children) {
          d3.select(this)
            .attr('stroke', isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
            .attr('stroke-width', 0.5)
            .style('filter', null);
          // In hover mode, hide all bridges on mouseout
          if (bridgeVisRef.current === 'hover' && d.depth === 1 && d.data._groupField === 'domain') {
            bridgeG.selectAll('.bridge-arc').style('opacity', 0);
          }
        } else {
          const n = d.data._node;
          const interaction = n ? getInteractionStyle(n, viewedNodes) : null;
          d3.select(this)
            .attr('stroke', interaction ? interaction.stroke : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)'))
            .attr('stroke-width', interaction ? interaction.width : 1)
            .attr('stroke-dasharray', interaction?.dasharray || null)
            .style('filter', interaction?.glow ? `drop-shadow(0 0 4px ${interaction.stroke})` : null);
        }
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        // Bridge builder mode: clicking a depth-1 domain group selects it for bridging
        if (bridgeModeRef.current && d.children && d.depth === 1 && d.data._groupField === 'domain') {
          bridgeClickRef.current(d.data.name);
          return;
        }
        if (d.children && focus !== d) {
          zoom(event, d);
        } else if (!d.children && d.data._node && onSelectNode) {
          onSelectNode(d.data._node);
        }
      });

    // Bridge arcs — semi-transparent curved lines between bridged domain groups
    const bridgeG = svg.append('g')
      .attr('class', 'bridges')
      .attr('pointer-events', 'visibleStroke');

    // Build domain→partition map and draw bridges when grouped by domain
    // Both APIs return flat arrays (not wrapped in an object)
    if (bridgeVis !== 'off' && groupBy === 'domain' && Array.isArray(partitionData) && Array.isArray(bridgeData) && bridgeData.length > 0) {
      const domainToPartition = {};
      // Track which partition IDs are system or non-active transient — exclude from bridges
      const excludedPartitions = new Set();
      for (const p of partitionData) {
        if (p.system || (p.transient && p.state !== 'active')) {
          excludedPartitions.add(p.id);
          continue;
        }
        for (const d of (p.domains || [])) {
          domainToPartition[d] = p.id;
        }
      }

      // Find which domain groups are bridged
      const depth1Groups = root.children || [];
      const domainGroupMap = {};
      for (const g of depth1Groups) {
        domainGroupMap[g.data.name] = g;
      }

      // Assign each source domain a distinct hue for bridge coloring
      const allDomainNames = Object.keys(domainGroupMap).sort();
      const domainColorScale = d3.scaleOrdinal()
        .domain(allDomainNames)
        .range(d3.quantize(t => d3.interpolateRainbow(t * 0.85 + 0.05), Math.max(allDomainNames.length, 1)));

      const drawnBridges = new Set();
      const domainArcCount = {}; // track how many arcs touch each domain for spreading
      for (const bridge of bridgeData) {
        // Skip bridges involving system or non-active transient partitions
        if (excludedPartitions.has(bridge.partition_a) || excludedPartitions.has(bridge.partition_b)) continue;
        // Find all domains in partition_a and partition_b
        const domainsA = Object.entries(domainToPartition)
          .filter(([, pid]) => pid === bridge.partition_a)
          .map(([d]) => d);
        const domainsB = Object.entries(domainToPartition)
          .filter(([, pid]) => pid === bridge.partition_b)
          .map(([d]) => d);

        // Draw an arc between each pair of domain groups that are bridged
        for (const dA of domainsA) {
          for (const dB of domainsB) {
            const gA = domainGroupMap[dA];
            const gB = domainGroupMap[dB];
            if (!gA || !gB) continue;
            const key = [dA, dB].sort().join('|');
            if (drawnBridges.has(key)) continue;
            drawnBridges.add(key);

            // Gradient from source color to target color
            const colorA = domainColorScale(dA);
            const colorB = domainColorScale(dB);
            const gradId = `bridge-grad-${drawnBridges.size}`;
            const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
            const grad = defs.append('linearGradient').attr('id', gradId).attr('gradientUnits', 'userSpaceOnUse');
            grad.append('stop').attr('offset', '0%').attr('stop-color', colorA).attr('stop-opacity', 0.6);
            grad.append('stop').attr('offset', '100%').attr('stop-color', colorB).attr('stop-opacity', 0.6);

            // Assign arc index based on how many arcs already touch either domain
            const arcIdx = Math.max(domainArcCount[dA] || 0, domainArcCount[dB] || 0);
            domainArcCount[dA] = (domainArcCount[dA] || 0) + 1;
            domainArcCount[dB] = (domainArcCount[dB] || 0) + 1;

            bridgeG.append('path')
              .attr('class', 'bridge-arc')
              .datum({ source: gA, target: gB, gradId, arcIndex: arcIdx, domainA: dA, domainB: dB })
              .attr('fill', 'none')
              .attr('stroke', `url(#${gradId})`)
              .attr('stroke-width', 2.5)
              .style('opacity', bridgeVis === 'all' ? 1 : 0)
              .style('cursor', 'pointer')
              .style('transition', 'opacity 0.2s ease, filter 0.15s ease')
              .on('mouseover', function () {
                d3.select(this)
                  .attr('stroke-width', 4)
                  .style('filter', 'brightness(1.8) drop-shadow(0 0 6px rgba(139,92,246,0.6))');
              })
              .on('mouseout', function () {
                d3.select(this)
                  .attr('stroke-width', 2.5)
                  .style('filter', null);
              });
          }
        }
      }
    }

    // Update bridge arc positions and gradient endpoints (called from zoomTo)
    function updateBridgeArcs() {
      if (!view) return;
      bridgeG.selectAll('.bridge-arc').each(function (d) {
        const k = size / view[2];
        // Circle centers in screen space
        const cx1 = (d.source.x - view[0]) * k;
        const cy1 = (d.source.y - view[1]) * k;
        const cx2 = (d.target.x - view[0]) * k;
        const cy2 = (d.target.y - view[1]) * k;
        const r1 = d.source.r * k;
        const r2 = d.target.r * k;

        const dx = cx2 - cx1;
        const dy = cy2 - cy1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) {
          d3.select(this).attr('d', `M${cx1},${cy1} L${cx2},${cy2}`);
          return;
        }

        // Perpendicular unit vector (two candidates)
        const perpAx = -dy / dist;
        const perpAy = dx / dist;
        // Pick the outward perpendicular (farther from layout center 0,0)
        const midCx = (cx1 + cx2) / 2;
        const midCy = (cy1 + cy2) / 2;
        const testAx = midCx + perpAx;
        const testAy = midCy + perpAy;
        const testBx = midCx - perpAx;
        const testBy = midCy - perpAy;
        const outward = (testAx * testAx + testAy * testAy) >= (testBx * testBx + testBy * testBy) ? 1 : -1;
        const perpX = perpAx * outward;
        const perpY = perpAy * outward;

        // Start/end on the OUTER edge of each circle (perpendicular, facing outward)
        // This places endpoints in clean outer space, not at the touching points
        const x1 = cx1 + perpX * r1;
        const y1 = cy1 + perpY * r1;
        const x2 = cx2 + perpX * r2;
        const y2 = cy2 + perpY * r2;

        // Wide arc — control point bows OUTWARD
        const arcBase = 1.5 + (d.arcIndex || 0) * 0.6;
        const bowDist = Math.max(dist * arcBase, (r1 + r2) * 2.5);
        const cpx = (x1 + x2) / 2 + perpX * bowDist;
        const cpy = (y1 + y2) / 2 + perpY * bowDist;
        const path = `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`;
        d3.select(this).attr('d', path);

        // Update gradient direction to follow arc
        if (d.gradId) {
          svg.select(`#${d.gradId}`)
            .attr('x1', x1).attr('y1', y1)
            .attr('x2', x2).attr('y2', y2);
        }
      });
    }

    // Labels — group labels single-line, leaf labels word-wrapped.
    // Text is only visible when parent is focused, so we compute wrap width
    // based on the ZOOMED-IN radius (d.r * k where k = size / (parent.r * 2)),
    // not the tiny pack-space radius.
    const CHAR_WIDTH = 5.4;   // approx SVG units per character at 9px font
    const LINE_HEIGHT_PX = 11; // approx SVG units per line at 9px
    const haloColor = isDark ? 'rgba(17,24,39,0.85)' : 'rgb(224,229,238)';

    const labelG = svg.append('g')
      .style('font-family', 'system-ui, -apple-system, sans-serif')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle');

    const label = labelG.selectAll('text')
      .data(root.descendants())
      .join('text')
      .style('fill-opacity', d => d.parent === root ? 1 : 0)
      .style('display', d => d.parent === root ? 'inline' : 'none')
      .style('fill', isDark ? '#e2e8f0' : '#1e293b')
      .style('font-weight', d => d.children ? '600' : '400')
      .style('font-size', d => {
        if (d.depth <= 1) return '13px';
        if (d.depth === 2 && d.children) return '11px';
        return '9px';
      })
      // Halo backdrop for contrast against any background
      .style('paint-order', 'stroke')
      .style('stroke', haloColor)
      .style('stroke-width', '3px')
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .each(function (d) {
        const el = d3.select(this);
        el.text(null);

        if (d === root) return;

        // Group labels — single line
        if (d.children) {
          el.append('tspan').attr('x', 0).attr('dy', '0.35em').text(d.data.name);
          return;
        }

        // Leaf labels — word-wrapped based on zoomed-in appearance.
        // When parent is focused, k = size / (parent.r * 2), so the leaf
        // circle appears as d.r * k SVG units. Use that for wrapping.
        const parentR = d.parent ? d.parent.r : root.r;
        const zoomedR = d.r * size / (parentR * 2);
        const zoomedDiameter = zoomedR * 2;

        const maxChars = Math.max(8, Math.floor(zoomedDiameter / CHAR_WIDTH));
        const maxLines = Math.min(6, Math.max(1, Math.floor(zoomedDiameter / LINE_HEIGHT_PX)));
        const lines = wordWrap(d.data.name, maxChars, maxLines);

        if (lines.length === 0) return;

        const lineHeight = 1.15; // em
        const startOffset = -((lines.length - 1) * lineHeight) / 2;

        lines.forEach((line, i) => {
          el.append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? `${startOffset + 0.35}em` : `${lineHeight}em`)
            .text(line);
        });
      });

    // Breadcrumb — shows current focus group at top of canvas
    const breadcrumb = svg.append('text')
      .attr('x', -W / 2 + 12)
      .attr('y', -H / 2 + 22)
      .style('font-family', 'system-ui, -apple-system, sans-serif')
      .style('font-size', '13px')
      .style('font-weight', '600')
      .style('fill', isDark ? '#94a3b8' : '#475569')
      .style('paint-order', 'stroke')
      .style('stroke', isDark ? 'rgba(17,24,39,0.9)' : 'rgba(224,229,238,0.9)')
      .style('stroke-width', '4px')
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .attr('pointer-events', 'none');

    // Zoom state — preserve focus across data refreshes
    svg.on('click', (event) => zoom(event, root));
    let focus = root;
    let view;

    // Build a name-path for a node so we can find it again after rebuild
    function getNodePath(d) {
      const parts = [];
      let cur = d;
      while (cur && cur !== root) {
        parts.unshift(cur.data.name);
        cur = cur.parent;
      }
      return parts.join('/');
    }

    function getFocusLabel(d) {
      if (!d || d === root) return '';
      const parts = [];
      let cur = d;
      while (cur && cur !== root) { parts.unshift(cur.data.name); cur = cur.parent; }
      return parts.join(' \u203a ');
    }

    // Restore previous focus if the same group still exists
    if (focusPathRef.current) {
      const target = root.descendants().find(d => d.children && getNodePath(d) === focusPathRef.current);
      if (target) focus = target;
    }

    zoomTo([focus.x, focus.y, focus.r * 2]);
    // Set initial label visibility to match restored focus
    label.style('fill-opacity', d => d.parent === focus ? 1 : 0)
         .style('display', d => d.parent === focus ? 'inline' : 'none');
    breadcrumb.text(getFocusLabel(focus));

    function zoomTo(v) {
      const k = size / v[2];
      view = v;
      label.attr('transform', d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
      node.attr('transform', d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
      node.attr('r', d => d.r * k);
      updateBridgeArcs();
    }

    function zoom(event, d) {
      focus = d;
      focusPathRef.current = d === root ? null : getNodePath(d);
      breadcrumb.text(getFocusLabel(d));
      const transition = svg.transition()
        .duration(event.altKey ? 7500 : 750)
        .tween('zoom', () => {
          const i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2]);
          return t => zoomTo(i(t));
        });

      label
        .filter(function (d) { return d.parent === focus || this.style.display === 'inline'; })
        .transition(transition)
        .style('fill-opacity', d => d.parent === focus ? 1 : 0)
        .on('start', function (d) { if (d.parent === focus) this.style.display = 'inline'; })
        .on('end', function (d) { if (d.parent !== focus) this.style.display = 'none'; });
    }

    // Scroll wheel zoom
    svg.on('wheel.zoom', (event) => {
      event.preventDefault();
      const currentK = size / view[2];
      if (event.deltaY < 0) {
        // Scroll up = zoom in — find group under cursor
        if (!focus.children) return;
        const [mx, my] = d3.pointer(event, svg.node());
        const px = mx / currentK + view[0];
        const py = my / currentK + view[1];
        const target = focus.children
          .filter(d => d.children)
          .find(d => {
            const dx = d.x - px, dy = d.y - py;
            return dx * dx + dy * dy <= d.r * d.r;
          });
        if (target) zoom(event, target);
      } else {
        // Scroll down = zoom out
        if (focus !== root) zoom(event, focus.parent || root);
      }
    });

    return () => {};
  }, [data, dimensions, onSelectNode, isDark, viewedNodes, groupBy, subGroup, sizeBy, partitionData, bridgeData, bridgeVis]);

  // Bridge builder: create a bridge between two domains
  const handleBridgeDomainClick = useCallback(async (domainName) => {
    if (!bridgeMode || !Array.isArray(partitionData)) return;

    // Find which partition this domain belongs to
    const partition = partitionData.find(p => (p.domains || []).includes(domainName));
    if (!partition) return;

    if (!bridgeSource) {
      setBridgeSource({ domain: domainName, partitionId: partition.id, partitionName: partition.name });
      return;
    }

    // Second click — create bridge
    if (bridgeSource.partitionId === partition.id) {
      // Same partition, no bridge needed
      setBridgeSource(null);
      return;
    }

    try {
      await partitionsApi.createBridge(bridgeSource.partitionId, partition.id);
      queryClient.invalidateQueries({ queryKey: ['partitions', 'bridges'] });
      setBridgeSource(null);
      setBridgeMode(false);
    } catch (err) {
      console.error('Failed to create bridge:', err);
      setBridgeSource(null);
    }
  }, [bridgeMode, bridgeSource, partitionData, queryClient]);

  // Expose bridge click handler to the D3 circle click
  const bridgeModeRef = useRef(bridgeMode);
  const bridgeClickRef = useRef(handleBridgeDomainClick);
  const bridgeVisRef = useRef(bridgeVis);
  useEffect(() => { bridgeModeRef.current = bridgeMode; }, [bridgeMode]);
  useEffect(() => { bridgeClickRef.current = handleBridgeDomainClick; }, [handleBridgeDomainClick]);
  useEffect(() => { bridgeVisRef.current = bridgeVis; }, [bridgeVis]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        Loading graph...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Failed to load graph data
      </div>
    );
  }

  if (!data?.nodes?.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        No nodes to display. Add some seeds to get started.
      </div>
    );
  }

  const sizeLabel = SIZE_FIELDS.find(f => f.value === sizeBy)?.label || 'Weight';

  return (
    <div className="absolute inset-0 flex gap-0">
      {/* Controls sidebar — outside the diagram, no overlap */}
      <div className="flex-shrink-0 w-36 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-2.5 overflow-y-auto text-xs space-y-2">
        {/* Type legend */}
        <div className="space-y-1">
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[type] }} />
              <span className="text-gray-600 dark:text-gray-300 text-xs truncate">{label}</span>
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-200 dark:border-gray-700">
          Size = {sizeLabel.toLowerCase()}<br/>Opacity = salience
        </div>

        {/* Packing controls */}
        <div className="space-y-1.5 pt-1 border-t border-gray-200 dark:border-gray-700">
          <div>
            <label className="block text-xs text-gray-400 dark:text-gray-500 mb-0.5">Pack by</label>
            <select value={groupBy} onChange={e => { setGroupBy(e.target.value); setBridgeMode(false); setBridgeSource(null); }}
              className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-gray-700 outline-none">
              {GROUP_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 dark:text-gray-500 mb-0.5">Sub-group</label>
            <select value={subGroup} onChange={e => setSubGroup(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-gray-700 outline-none">
              <option value="none">None</option>
              {GROUP_FIELDS.filter(f => f.value !== groupBy).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 dark:text-gray-500 mb-0.5">Size by</label>
            <select value={sizeBy} onChange={e => setSizeBy(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-gray-700 outline-none">
              {SIZE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        {/* Bridge controls — only visible when grouped by domain */}
        {groupBy === 'domain' && (
          <div className="space-y-1.5 pt-1 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400 dark:text-gray-500">Bridges</label>
              <button
                onClick={() => setBridgeVis(v => v === 'off' ? 'hover' : v === 'hover' ? 'all' : 'off')}
                className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                  bridgeVis !== 'off'
                    ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
                }`}
              >
                {bridgeVis === 'off' ? 'Off' : bridgeVis === 'hover' ? 'Hover' : 'All'}
              </button>
            </div>
            {!bridgeMode ? (
              <button
                onClick={() => { setBridgeMode(true); setBridgeSource(null); }}
                className="w-full text-xs px-2 py-1 rounded border border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              >
                + Bridge
              </button>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                  {bridgeSource
                    ? <>Click target domain to bridge with <strong>{bridgeSource.domain}</strong></>
                    : 'Click source domain...'}
                </div>
                <button
                  onClick={() => { setBridgeMode(false); setBridgeSource(null); }}
                  className="w-full text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Interaction legend */}
        <div className="space-y-1 pt-1 border-t border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ borderColor: '#a78bfa', borderStyle: 'dashed', borderWidth: '1px', boxShadow: '0 0 4px #a78bfa' }} />
            <span>Viewed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ borderColor: '#22c55e', borderStyle: 'solid', borderWidth: '1px' }} />
            <span>Useful</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ borderColor: '#eab308', borderStyle: 'solid', borderWidth: '1px' }} />
            <span>Neutral</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ borderColor: '#ef4444', borderStyle: 'solid', borderWidth: '1px' }} />
            <span>Harmful</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ borderColor: '#f97316', borderStyle: 'dashed', borderWidth: '1px', boxShadow: '0 0 4px #f97316' }} />
            <span>Excluded</span>
          </div>
          {groupBy === 'domain' && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-0 flex-shrink-0" style={{ borderTop: '2px solid rgba(139,92,246,0.4)' }} />
              <span>Bridge</span>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-200 dark:border-gray-700">
          Scroll to zoom<br/>Click group to enter<br/>Background to zoom out
        </div>

        {data?.summary && (
          <div className="text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-200 dark:border-gray-700">
            {data.summary.warm} / {data.summary.total} nodes
          </div>
        )}

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Diagram area — takes all remaining space */}
      <div ref={containerRef} className="relative flex-1 min-w-0 min-h-0">
        <svg
          ref={svgRef}
          className="rounded-r-lg"
          style={{
            width: '100%', height: '100%', display: 'block',
            ...(bridgeMode ? { outline: '2px solid rgba(139,92,246,0.5)', outlineOffset: '-2px', cursor: 'crosshair' } : {}),
          }}
        />
        {bridgeMode && bridgeSource && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs px-3 py-1 rounded-full shadow-lg">
            Bridging from: {bridgeSource.domain} ({bridgeSource.partitionName})
          </div>
        )}
      </div>
    </div>
  );
}
