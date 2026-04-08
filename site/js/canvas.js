/**
 * PODBIT — Background Canvas: Animated Knowledge Graph
 *
 * Fixed full-viewport canvas behind all content.
 * Faint, warm network of nodes and edges.
 * Orange-dominant palette. Subtle and professional.
 * Mouse interaction works across the whole page.
 */

(() => {
  

  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const CFG = {
    nodeCount:      80,
    maxEdgeDist:    160,
    nodeMinR:       1.2,
    nodeMaxR:       3,
    driftSpeed:     0.12,
    cursorRadius:   160,
    cursorForce:    0.3,
    edgeOpacity:    0.12,
    pulseInterval:  4000,
    pulseSpeed:     0.006,
    pulseDuration:  1500,
    colors: {
      orange1: [217, 119, 6],   // amber-600
      orange2: [245, 158, 11],  // amber-500
      orange3: [180, 83, 9],    // amber-800
      warm:    [200, 140, 60],  // warm gold
      faint:   [160, 120, 70],  // muted brown-gold
    },
  };

  const colorKeys = Object.keys(CFG.colors);

  let W, H, dpr;
  let nodes = [];
  const mouse = { x: -1000, y: -1000 };
  let lastPulse = 0;
  const activePulses = [];
  let animId;

  function createNode(i) {
    const colorName = colorKeys[i % colorKeys.length];
    const rgb = CFG.colors[colorName];
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * CFG.driftSpeed * 2,
      vy: (Math.random() - 0.5) * CFG.driftSpeed * 2,
      r: CFG.nodeMinR + Math.random() * (CFG.nodeMaxR - CFG.nodeMinR),
      rgb,
      glow: 0,
      glowDecay: 0,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    resize();
    nodes = [];
    for (let i = 0; i < CFG.nodeCount; i++) {
      nodes.push(createNode(i));
    }
  }

  function update(now) {
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;

      if (n.x < -20)    { n.x = -20;    n.vx *= -1; }
      if (n.x > W + 20) { n.x = W + 20; n.vx *= -1; }
      if (n.y < -20)    { n.y = -20;    n.vy *= -1; }
      if (n.y > H + 20) { n.y = H + 20; n.vy *= -1; }

      n.vx += (Math.random() - 0.5) * 0.008;
      n.vy += (Math.random() - 0.5) * 0.008;

      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > CFG.driftSpeed) {
        n.vx = (n.vx / speed) * CFG.driftSpeed;
        n.vy = (n.vy / speed) * CFG.driftSpeed;
      }

      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CFG.cursorRadius && dist > 0) {
        const force = (1 - dist / CFG.cursorRadius) * CFG.cursorForce;
        n.vx += (dx / dist) * force;
        n.vy += (dy / dist) * force;
      }

      if (n.glow > 0) {
        const elapsed = now - n.glowDecay;
        if (elapsed > 0) {
          n.glow = Math.max(0, 1 - elapsed / CFG.pulseDuration);
        }
      }
    }

    if (now - lastPulse > CFG.pulseInterval) {
      lastPulse = now;
      const src = Math.floor(Math.random() * nodes.length);
      activePulses.push({ sourceIdx: src, startTime: now, visited: new Set([src]) });
      nodes[src].glow = 1;
      nodes[src].glowDecay = now + 200;
    }

    for (let p = activePulses.length - 1; p >= 0; p--) {
      const pulse = activePulses[p];
      const age = now - pulse.startTime;
      if (age > 3000) {
        activePulses.splice(p, 1);
        continue;
      }

      const newVisits = [];
      for (const vi of pulse.visited) {
        const a = nodes[vi];
        for (let j = 0; j < nodes.length; j++) {
          if (pulse.visited.has(j)) continue;
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (dx * dx + dy * dy < CFG.maxEdgeDist * CFG.maxEdgeDist) {
            newVisits.push(j);
          }
        }
      }
      const maxSpread = Math.min(newVisits.length, 2);
      for (let k = 0; k < maxSpread; k++) {
        const idx = newVisits[Math.floor(Math.random() * newVisits.length)];
        if (!pulse.visited.has(idx)) {
          pulse.visited.add(idx);
          nodes[idx].glow = 1;
          nodes[idx].glowDecay = now + 100;
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Edges
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        const maxSq = CFG.maxEdgeDist * CFG.maxEdgeDist;
        if (distSq > maxSq) continue;

        const dist = Math.sqrt(distSq);
        const alpha = (1 - dist / CFG.maxEdgeDist) * CFG.edgeOpacity;
        const glow = Math.max(a.glow, b.glow);
        const glowAlpha = alpha + glow * 0.25;

        if (glow > 0.1) {
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, `rgba(${a.rgb[0]},${a.rgb[1]},${a.rgb[2]},${glowAlpha})`);
          grad.addColorStop(1, `rgba(${b.rgb[0]},${b.rgb[1]},${b.rgb[2]},${glowAlpha})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.6 + glow * 0.8;
        } else {
          ctx.strokeStyle = `rgba(217,119,6,${alpha})`;
          ctx.lineWidth = 0.4;
        }

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Nodes
    for (const n of nodes) {
      const baseAlpha = 0.45 + n.glow * 0.4;
      const r = n.r + n.glow * 2;

      if (n.glow > 0.05) {
        const haloR = r + n.glow * 12;
        const grad = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, haloR);
        grad.addColorStop(0, `rgba(${n.rgb[0]},${n.rgb[1]},${n.rgb[2]},${n.glow * 0.25})`);
        grad.addColorStop(1, `rgba(${n.rgb[0]},${n.rgb[1]},${n.rgb[2]},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${n.rgb[0]},${n.rgb[1]},${n.rgb[2]},${baseAlpha})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(now) {
    update(now);
    draw();
    animId = requestAnimationFrame(loop);
  }

  // Mouse tracking — works across the whole page since canvas is fixed viewport
  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }
  function onMouseLeave() {
    mouse.x = -1000;
    mouse.y = -1000;
  }

  let resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      for (const n of nodes) {
        if (n.x > W) n.x = W - 10;
        if (n.y > H) n.y = H - 10;
      }
    }, 150);
  }

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(animId);
    } else {
      lastPulse = performance.now();
      animId = requestAnimationFrame(loop);
    }
  }

  // Listen on document for mouse since canvas has pointer-events: none
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  init();
  animId = requestAnimationFrame(loop);
})();
