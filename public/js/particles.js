// ─── Floating Particles Background ───
(function() {
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-particles';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:-3;pointer-events:none;';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let w, h, particles;
  const COLORS = [
    'rgba(247,183,49,0.4)',   // gold
    'rgba(136,84,208,0.35)',  // purple
    'rgba(235,59,90,0.3)',    // pink
    'rgba(15,185,177,0.35)',  // teal
    'rgba(56,103,214,0.3)',   // blue
    'rgba(250,130,49,0.3)'   // orange
  ];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createParticles() {
    const count = Math.floor((w * h) / 25000);
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.005 + Math.random() * 0.015
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.dx;
      p.y += p.dy;
      p.pulse += p.pulseSpeed;

      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      const alpha = 0.4 + Math.sin(p.pulse) * 0.3;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); createParticles(); });
  resize();
  createParticles();
  draw();
})();
