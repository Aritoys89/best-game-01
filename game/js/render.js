// render.js — the valley at night: a gradient sky, three depths of
// mountain silhouette drifting at different parallax rates, a starfield
// that twinkles, and the ridge the keeper walks. Everything is drawn from
// seeded shapes in code — there are no image assets.

// A tiny deterministic PRNG so the valley looks the same on every load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Background {
  constructor(width, height) {
    this.W = width;
    this.H = height;
    const rng = mulberry32(20261116);
    // Three star depths; nearer stars are bigger and drift faster.
    this.starLayers = [0.25, 0.6, 1.1].map((depth, li) => {
      const stars = [];
      const count = [90, 60, 34][li];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: rng() * width,
          y: rng() * height * 0.62,
          r: 0.6 + depth * rng() * 1.1,
          phase: rng() * Math.PI * 2,
          depth,
        });
      }
      return stars;
    });
    // Ridgelines for the far and mid mountains, as height maps.
    this.ridges = [this.makeRidge(rng, 26, 0.5), this.makeRidge(rng, 20, 0.75)];
    this.t = 0;
  }

  makeRidge(rng, points, jagged) {
    const pts = [];
    for (let i = 0; i <= points; i++) pts.push(0.25 + rng() * 0.75 * jagged + rng() * 0.2);
    return pts;
  }

  ridgePath(ctx, pts, baseY, amp, offsetX) {
    const step = this.W / (pts.length - 1);
    ctx.beginPath();
    ctx.moveTo(-offsetX, baseY);
    for (let i = 0; i < pts.length; i++) {
      ctx.lineTo(i * step - offsetX, baseY - pts[i] * amp);
    }
    ctx.lineTo(this.W - offsetX + step, baseY);
    ctx.lineTo(this.W, this.H);
    ctx.lineTo(0, this.H);
    ctx.closePath();
  }

  draw(ctx, camX) {
    this.t += 1 / 60;
    const { W, H } = this;

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#060a1c');
    sky.addColorStop(0.55, '#0d1531');
    sky.addColorStop(0.85, '#1a2342');
    sky.addColorStop(1, '#232c4e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // A pale moon, high and indifferent.
    ctx.fillStyle = 'rgba(226, 234, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(W - 130, 92, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190, 202, 235, 0.5)';
    ctx.beginPath();
    ctx.arc(W - 138, 86, 4.5, 0, Math.PI * 2);
    ctx.arc(W - 122, 100, 3.2, 0, Math.PI * 2);
    ctx.fill();
    const moonGlow = ctx.createRadialGradient(W - 130, 92, 20, W - 130, 92, 90);
    moonGlow.addColorStop(0, 'rgba(200, 215, 255, 0.13)');
    moonGlow.addColorStop(1, 'rgba(200, 215, 255, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(W - 230, 0, 200, 200);

    // Stars, twinkling, drifting with parallax as the keeper moves.
    for (const layer of this.starLayers) {
      for (const s of layer) {
        const tw = 0.55 + 0.45 * Math.sin(this.t * 1.7 + s.phase);
        ctx.globalAlpha = tw * (0.35 + s.depth * 0.5);
        ctx.fillStyle = '#e8eeff';
        const x = ((s.x - camX * s.depth * 6) % W + W) % W;
        ctx.beginPath();
        ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Far mountains.
    ctx.fillStyle = '#141d3a';
    this.ridgePath(ctx, this.ridges[0], H - 120, 190, (camX * 0.12) % 60);
    ctx.fill();
    // Mid mountains.
    ctx.fillStyle = '#0e1529';
    this.ridgePath(ctx, this.ridges[1], H - 66, 130, (camX * 0.3) % 60);
    ctx.fill();

    // The ridge she walks: a dark crest with a warm edge where her light
    // has brushed it for years.
    ctx.fillStyle = '#080d1c';
    ctx.beginPath();
    ctx.moveTo(0, H - 38);
    for (let x = 0; x <= W; x += 32) {
      ctx.lineTo(x, H - 38 - Math.sin(x * 0.011 + 2) * 5 - Math.sin(x * 0.031) * 2);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 110, 90, 0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 32) {
      const y = H - 38 - Math.sin(x * 0.011 + 2) * 5 - Math.sin(x * 0.031) * 2;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
