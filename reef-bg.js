(function () {
  const canvas = document.getElementById("ofs-reef");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const kelp = [];
  const motes = [];
  function size() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  function seed() {
    kelp.length = 0;
    motes.length = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const n = Math.max(10, Math.floor(w / 70));
    for (let i = 0; i < n; i++) {
      kelp.push({
        x: (i + 0.3) * (w / n),
        h: 0.35 + Math.random() * 0.55,
        w: 6 + Math.random() * 10,
        hue: 140 + Math.random() * 40,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.6,
      });
    }
    for (let i = 0; i < 40; i++) {
      motes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        v: 0.15 + Math.random() * 0.35,
      });
    }
  }
  function draw(t) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#071820");
    g.addColorStop(1, "#041016");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    kelp.forEach((k) => {
      ctx.beginPath();
      ctx.moveTo(k.x, h);
      const top = h * (1 - k.h);
      const sway = Math.sin(t * 0.001 * k.speed + k.phase) * 18;
      ctx.bezierCurveTo(k.x + sway * 0.3, h * 0.7, k.x - sway, h * 0.4, k.x + sway, top);
      ctx.strokeStyle = "hsla(" + k.hue + ",35%,38%,.55)";
      ctx.lineWidth = k.w;
      ctx.lineCap = "round";
      ctx.stroke();
    });
    motes.forEach((m) => {
      if (!reduce) {
        m.y -= m.v;
        m.x += Math.sin(t * 0.001 + m.y) * 0.15;
        if (m.y < -4) { m.y = h + 4; m.x = Math.random() * w; }
      }
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(207,228,220,.22)";
      ctx.fill();
    });
    if (!reduce) requestAnimationFrame(draw);
  }
  size();
  seed();
  draw(0);
  window.addEventListener("resize", () => { size(); seed(); });
})();
