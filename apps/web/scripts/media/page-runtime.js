/* Browser-side canvas scene library for WallHaze's self-authored media.
 * Every pixel is drawn procedurally here; no third-party image or video is
 * loaded. The Node generator injects this file into a headless Edge page. */
(() => {
  const TAU = Math.PI * 2;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  function rad(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }

  function glow(ctx, x, y, radius, color, alpha = 1) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rad(ctx, x, y, 0, radius, [
      [0, color],
      [0.35, color.replace(/[\d.]+\)$/u, "0.35)")],
      [1, "rgba(0,0,0,0)"],
    ]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  let grainTile = null;
  function grainPattern(ctx) {
    if (!grainTile) {
      const size = 220;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const g = canvas.getContext("2d");
      const image = g.createImageData(size, size);
      for (let i = 0; i < image.data.length; i += 4) {
        const value = Math.floor(Math.random() * 255);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 30;
      }
      g.putImageData(image, 0, 0);
      grainTile = canvas;
    }
    return ctx.createPattern(grainTile, "repeat");
  }

  function addGrain(ctx, w, h, alpha = 0.06) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function addVignette(ctx, w, h, strength = 0.28) {
    ctx.save();
    ctx.fillStyle = rad(ctx, w / 2, h / 2, Math.min(w, h) * 0.2, Math.max(w, h) * 0.78, [
      [0, "rgba(0,0,0,0)"],
      [0.72, "rgba(0,0,0,0.08)"],
      [1, `rgba(0,0,0,${strength})`],
    ]);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function fogBand(ctx, w, h, y, height, color, alpha = 0.18) {
    const grad = ctx.createLinearGradient(0, y - height, 0, y + height);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.45, color.replace(/[\d.]+\)$/u, `${alpha})`));
    grad.addColorStop(0.6, color.replace(/[\d.]+\)$/u, `${alpha * 0.7})`));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - height, w, height * 2);
  }

  function cloudBank(ctx, w, h, y, seed, color, alpha = 0.16, count = 8) {
    const random = rng(seed);
    for (let i = 0; i < count; i += 1) {
      cloud(
        ctx,
        w * (0.02 + random() * 0.96),
        y + (random() - 0.5) * h * 0.06,
        w * (0.05 + random() * 0.11),
        color,
        alpha * (0.5 + random() * 0.7)
      );
    }
  }

  function smoothRidge(ctx, w, h, baseY, amp, color, seed, points = 7) {
    const random = rng(seed);
    const pts = [];
    for (let i = 0; i <= points; i += 1) {
      pts.push({
        x: (w / points) * i + (random() - 0.5) * w * 0.02,
        y: baseY - random() * amp,
      });
    }
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, h + 20);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1];
      const next = pts[i];
      const mx = (prev.x + next.x) / 2;
      const my = (prev.y + next.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      if (i === pts.length - 1) ctx.quadraticCurveTo(next.x, next.y, next.x, next.y);
    }
    ctx.lineTo(w + 20, h + 20);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function starField(ctx, w, h, seed, count, t, duration, opts = {}) {
    const random = rng(seed);
    const base = opts.color ?? "255,255,255";
    for (let i = 0; i < count; i += 1) {
      const x = random() * w;
      const y = random() * h * (opts.band ?? 1);
      const r = 0.35 + random() * (opts.maxRadius ?? 1.4);
      const phase = random() * TAU;
      const twinkle = 0.45 + 0.55 * Math.sin(TAU * (t / duration) + phase);
      ctx.fillStyle = `rgba(${base},${0.25 + twinkle * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      if (r > 1.25 && twinkle > 0.8) {
        ctx.strokeStyle = `rgba(${base},0.4)`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - r * 4, y);
        ctx.lineTo(x + r * 4, y);
        ctx.moveTo(x, y - r * 4);
        ctx.lineTo(x, y + r * 4);
        ctx.stroke();
      }
    }
  }

  function cloud(ctx, x, y, scale, color, alpha = 0.5) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const puffs = [
      [-0.9, 0.1, 0.55],
      [-0.45, -0.15, 0.7],
      [0.05, -0.32, 0.9],
      [0.55, -0.08, 0.68],
      [0.95, 0.12, 0.5],
      [0.1, 0.15, 0.8],
    ];
    for (const [px, py, pr] of puffs) {
      const cx = x + px * scale;
      const cy = y + py * scale;
      const radius = pr * scale * 1.35;
      ctx.fillStyle = rad(ctx, cx, cy, 0, radius, [
        [0, color],
        [0.45, color],
        [1, "rgba(0,0,0,0)"],
      ]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function mountainRange(ctx, w, h, baseY, amp, color, seed, peaks = 6) {
    const random = rng(seed);
    ctx.beginPath();
    ctx.moveTo(-20, h + 20);
    ctx.lineTo(-20, baseY + random() * amp * 0.2);
    for (let i = 0; i <= peaks; i += 1) {
      const x = (w / peaks) * i;
      const peak = baseY - random() * amp;
      ctx.lineTo(x - w / peaks / 2, baseY - random() * amp * 0.25);
      ctx.lineTo(x, peak);
    }
    ctx.lineTo(w + 20, h + 20);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function pine(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size * 0.32, y + size * 0.32);
    ctx.lineTo(x - size * 0.12, y + size * 0.2);
    ctx.lineTo(x - size * 0.25, y + size * 0.55);
    ctx.lineTo(x + size * 0.25, y + size * 0.55);
    ctx.lineTo(x + size * 0.12, y + size * 0.2);
    ctx.lineTo(x + size * 0.32, y + size * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - size * 0.03, y + size * 0.45, size * 0.06, size * 0.35);
    ctx.restore();
  }

  function petal(ctx, x, y, size, rot, color, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, 0.48);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function bird(ctx, x, y, s, color, alpha = 0.8) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.55, x, y);
    ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.55, x + s, y);
    ctx.stroke();
    ctx.restore();
  }

  function branch(ctx, x, y, angle, length, width, depth, random, palette) {
    if (depth <= 0 || length < 2) return;
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    ctx.strokeStyle = palette.bark;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle - 0.2) * length * 0.6,
      y + Math.sin(angle - 0.2) * length * 0.6,
      x2,
      y2
    );
    ctx.stroke();
    if (depth <= 2) {
      const count = 5 + Math.floor(random() * 5);
      for (let i = 0; i < count; i += 1) {
        const bx = x2 + (random() - 0.5) * length * 0.8;
        const by = y2 + (random() - 0.5) * length * 0.8;
        const r = 1.5 + random() * 4;
        ctx.fillStyle = random() > 0.42 ? palette.blossom : palette.blossom2;
        ctx.globalAlpha = 0.55 + random() * 0.4;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const spread = 0.36 + random() * 0.2;
    branch(ctx, x2, y2, angle - spread, length * (0.64 + random() * 0.08), width * 0.64, depth - 1, random, palette);
    branch(ctx, x2, y2, angle + spread, length * (0.6 + random() * 0.1), width * 0.62, depth - 1, random, palette);
    if (depth > 3) {
      branch(ctx, x2, y2, angle + (random() - 0.5) * 0.3, length * 0.5, width * 0.5, depth - 2, random, palette);
    }
  }

  function lightRays(ctx, w, h, x, y, color, alpha, count = 7) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < count; i += 1) {
      const spread = (i / count - 0.5) * 0.85;
      const grad = ctx.createLinearGradient(x, y, x + Math.sin(spread) * w, h);
      grad.addColorStop(0, color.replace(/[\d.]+\)$/u, `${alpha})`));
      grad.addColorStop(0.7, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(spread) * w * 0.9 - w * 0.12, h);
      ctx.lineTo(x + Math.sin(spread) * w * 0.9 + w * 0.04, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNightSakura(ctx, w, h, t, duration, seed = 21) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#09051d"],
      [0.38, "#241052"],
      [0.72, "#5b2372"],
      [1, "#d06a88"],
    ]);
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.72, h * 0.2, w * 0.34, "rgba(255,214,238,0.55)");
    ctx.fillStyle = "#ffe8f5";
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.2, w * 0.075, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(160,120,190,0.18)";
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.19, w * 0.018, 0, TAU);
    ctx.arc(w * 0.745, h * 0.225, w * 0.012, 0, TAU);
    ctx.fill();
    starField(ctx, w, h, seed + 3, 70, t, duration, { band: 0.55, maxRadius: 1 });

    ctx.fillStyle = lin(ctx, 0, h * 0.68, 0, h, [
      [0, "#1b0b33"],
      [1, "#06030d"],
    ]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.73);
    for (let i = 0; i <= 8; i += 1) {
      ctx.lineTo((w / 8) * i, h * (0.68 + random() * 0.07));
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Torii gate on the right, kept as a clean silhouette.
    const tx = w * 0.8;
    const ty = h * 0.64;
    ctx.fillStyle = "#16071f";
    ctx.fillRect(tx - w * 0.13, ty, w * 0.015, h * 0.26);
    ctx.fillRect(tx + w * 0.115, ty, w * 0.015, h * 0.26);
    ctx.fillRect(tx - w * 0.17, ty, w * 0.34, h * 0.018);
    ctx.fillRect(tx - w * 0.14, ty + h * 0.035, w * 0.28, h * 0.012);

    const randomBranch = rng(seed + 11);
    branch(ctx, w * 0.08, h * 0.93, -0.95, h * 0.28, w * 0.035, 7, randomBranch, {
      bark: "#120719",
      blossom: "#ffb6d9",
      blossom2: "#f07fb9",
    });
    branch(ctx, w * 0.94, h * 0.88, -2.2, h * 0.22, w * 0.03, 6, rng(seed + 19), {
      bark: "#120719",
      blossom: "#ffc4e2",
      blossom2: "#d970ad",
    });

    // Hanging lanterns.
    for (const [lx, ly, r] of [
      [w * 0.23, h * 0.37, w * 0.035],
      [w * 0.17, h * 0.52, w * 0.028],
      [w * 0.86, h * 0.45, w * 0.026],
    ]) {
      ctx.strokeStyle = "rgba(20,8,30,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly - r * 3.3);
      ctx.lineTo(lx, ly - r * 1.2);
      ctx.stroke();
      glow(ctx, lx, ly, r * 4.2, "rgba(255,190,120,0.6)");
      ctx.fillStyle = "#ffd6a0";
      ctx.beginPath();
      ctx.ellipse(lx, ly, r, r * 1.25, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,239,200,0.75)";
      ctx.fillRect(lx - r * 0.45, ly - r * 0.35, r * 0.9, r * 0.12);
      ctx.fillRect(lx - r * 0.45, ly + r * 0.2, r * 0.9, r * 0.1);
    }

    // Stone path receding into the gate.
    ctx.fillStyle = "rgba(30,16,44,0.85)";
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h);
    ctx.lineTo(w * 0.56, h);
    ctx.lineTo(w * 0.64, h * 0.76);
    ctx.lineTo(w * 0.61, h * 0.76);
    ctx.closePath();
    ctx.fill();

    const petals = 72;
    for (let i = 0; i < petals; i += 1) {
      const baseX = random() * w;
      const baseY = random() * h;
      const speed = 0.4 + random() * 0.6;
      const x = baseX + Math.sin(TAU * phase * (0.7 + random()) + i) * w * 0.045;
      const y = ((baseY + phase * h * speed) % (h + h * 0.1)) - h * 0.05;
      petal(ctx, x, y, w * (0.004 + random() * 0.006), phase * TAU * (1 + random()) + i, random() > 0.5 ? "#ffc4de" : "#ef87b8", 0.55 + random() * 0.4);
    }
    ctx.fillStyle = "rgba(8,3,15,0.45)";
    ctx.fillRect(0, h * 0.95, w, h * 0.05);
  }

  function drawNeonRain(ctx, w, h, t, duration, seed = 31) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#07041a"],
      [0.5, "#190b38"],
      [1, "#05020c"],
    ]);
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.22, h * 0.24, w * 0.34, "rgba(255,52,190,0.38)");
    glow(ctx, w * 0.82, h * 0.28, w * 0.32, "rgba(40,220,255,0.3)");
    glow(ctx, w * 0.55, h * 0.18, w * 0.16, "rgba(190,220,255,0.35)");
    ctx.fillStyle = "rgba(235,245,255,0.7)";
    ctx.beginPath();
    ctx.arc(w * 0.55, h * 0.18, w * 0.03, 0, TAU);
    ctx.fill();
    cloudBank(ctx, w, h, h * 0.44, seed + 2, "rgba(115,80,180,0.9)", 0.12, 9);
    fogBand(ctx, w, h, h * 0.62, h * 0.06, "rgba(115,170,240,0.8)", 0.14);

    // Layered skyline.
    for (let layer = 0; layer < 3; layer += 1) {
      const base = h * (0.43 + layer * 0.09);
      const color = ["#110a28", "#160d31", "#090515"][layer];
      ctx.fillStyle = color;
      let x = -w * 0.05;
      while (x < w) {
        const bw = w * (0.045 + random() * 0.07);
        const bh = h * (0.12 + random() * 0.28) * (1 - layer * 0.14);
        ctx.fillRect(x, base - bh, bw, bh + h);
        if (layer === 0) {
          for (let wy = base - bh + h * 0.025; wy < base - h * 0.02; wy += h * 0.032) {
            for (let wx = x + bw * 0.15; wx < x + bw * 0.85; wx += bw * 0.24) {
              if (random() > 0.45) {
                ctx.fillStyle = random() > 0.5 ? "rgba(255,183,88,0.65)" : "rgba(95,220,255,0.55)";
                ctx.fillRect(wx, wy, Math.max(1, bw * 0.09), Math.max(1, h * 0.008));
                ctx.fillStyle = color;
              }
            }
          }
        } else if (layer === 1 && random() > 0.3) {
          for (let wy = base - bh + h * 0.04; wy < base - h * 0.03; wy += h * 0.05) {
            if (random() > 0.55) {
              ctx.fillStyle = random() > 0.5 ? "rgba(255,190,110,0.28)" : "rgba(95,210,255,0.24)";
              ctx.fillRect(x + bw * 0.2, wy, Math.max(1, bw * 0.1), Math.max(1, h * 0.006));
              ctx.fillStyle = color;
            }
          }
        }
        x += bw + w * 0.009;
      }
    }

    // Neon signs.
    const signs = [
      [w * 0.12, h * 0.39, w * 0.16, h * 0.025, "#ff3ea5"],
      [w * 0.64, h * 0.31, w * 0.19, h * 0.018, "#47e9ff"],
      [w * 0.35, h * 0.49, w * 0.11, h * 0.014, "#ffcf5a"],
      [w * 0.77, h * 0.45, w * 0.09, h * 0.022, "#b36bff"],
    ];
    for (const [sx, sy, sw, sh, color] of signs) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = w * 0.02;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(TAU * (t / duration) + sx);
      ctx.fillRect(sx, sy, sw, sh);
      ctx.restore();
    }

    // Wet street and reflections.
    ctx.fillStyle = lin(ctx, 0, h * 0.67, 0, h, [
      [0, "#140b2b"],
      [1, "#04020a"],
    ]);
    ctx.fillRect(0, h * 0.67, w, h * 0.33);
    // Perspective roadway.
    ctx.strokeStyle = "rgba(150,160,225,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.68);
      ctx.lineTo(w * (0.05 + i * 0.15), h);
      ctx.stroke();
    }
    for (const [sx, , sw, , color] of signs) {
      const grad = ctx.createLinearGradient(0, h * 0.68, 0, h);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = grad;
      ctx.fillRect(sx + sw * 0.15, h * 0.7, sw * 0.55, h * 0.28);
      ctx.restore();
    }
    // Umbrella silhouettes.
    for (const [ux, uy, us] of [[0.16, 0.76, 1], [0.83, 0.8, 0.75]]) {
      const cx = w * ux;
      const cy = h * uy;
      ctx.strokeStyle = "#09050d";
      ctx.lineWidth = Math.max(2, w * 0.004);
      ctx.beginPath();
      ctx.moveTo(cx, cy + h * 0.02);
      ctx.lineTo(cx, cy + h * 0.15 * us);
      ctx.stroke();
      ctx.fillStyle = "#0c0710";
      ctx.beginPath();
      ctx.arc(cx, cy + h * 0.015, w * 0.06 * us, Math.PI, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,90,190,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy + h * 0.015, w * 0.06 * us, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i += 1) {
      const x = random() * w;
      const y = h * (0.7 + random() * 0.25);
      const rw = w * (0.02 + random() * 0.08);
      const rh = h * (0.006 + random() * 0.022);
      ctx.fillStyle = random() > 0.5 ? "rgba(255,45,170,0.16)" : "rgba(55,220,255,0.14)";
      ctx.fillRect(x, y, rw, rh);
    }

    // Rain streaks, periodic so the loop matches.
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 150; i += 1) {
      const x = random() * w;
      const base = random() * h;
      const len = h * (0.015 + random() * 0.035);
      const y = ((base + phase * h * 1.2) % (h + len)) - len;
      ctx.strokeStyle = `rgba(180,215,255,${0.12 + random() * 0.25})`;
      ctx.lineWidth = Math.max(0.6, w * 0.0007);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - w * 0.008, y + len);
      ctx.stroke();
    }
    ctx.restore();

    // Puddle ripples.
    for (let i = 0; i < 5; i += 1) {
      const rx = w * (0.2 + i * 0.16);
      const ry = h * (0.85 + (i % 2) * 0.06);
      const spread = ((phase + i * 0.17) % 1) * w * 0.1;
      ctx.strokeStyle = `rgba(125,225,255,${0.2 * (1 - spread / (w * 0.1))})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(rx, ry, spread, spread * 0.18, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawStarDrift(ctx, w, h, t, duration, seed = 41) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, w, h, [
      [0, "#03030d"],
      [0.45, "#090425"],
      [1, "#02010a"],
    ]);
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 12; i += 1) {
      const x = w * (0.15 + random() * 0.7) + Math.sin(TAU * phase + i) * w * 0.012;
      const y = h * (0.12 + random() * 0.55);
      const r = w * (0.08 + random() * 0.2);
      const hue = ["rgba(125,42,255,0.16)", "rgba(30,155,255,0.13)", "rgba(255,55,180,0.12)"][i % 3];
      ctx.fillStyle = rad(ctx, x, y, 0, r, [
        [0, hue],
        [0.45, hue.replace(/[\d.]+\)$/u, "0.06)")],
        [1, "rgba(0,0,0,0)"],
      ]);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    starField(ctx, w, h, seed + 8, 460, t, duration, { maxRadius: 1.2 });
    // Bright stars with cross flare.
    for (let i = 0; i < 12; i += 1) {
      const x = random() * w;
      const y = random() * h * 0.8;
      const pulse = 0.55 + 0.45 * Math.sin(TAU * (t / duration) + i);
      glow(ctx, x, y, w * (0.006 + random() * 0.01), "rgba(255,255,255,0.8)", pulse);
    }
    // Shooting stars, periodic.
    for (let i = 0; i < 2; i += 1) {
      const cycle = (phase + i * 0.5) % 1;
      if (cycle < 0.18) {
        const p = cycle / 0.18;
        const sx = w * (0.2 + i * 0.45) + p * w * 0.25;
        const sy = h * (0.14 + i * 0.16) + p * h * 0.18;
        const grad = ctx.createLinearGradient(sx, sy, sx - w * 0.2, sy - h * 0.14);
        grad.addColorStop(0, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(1, w * 0.0015);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - w * 0.2, sy - h * 0.14);
        ctx.stroke();
      }
    }
    // Ringed planet.
    const px = w * 0.76;
    const py = h * 0.74;
    const pr = Math.min(w, h) * 0.14;
    glow(ctx, px, py, pr * 1.8, "rgba(90,90,255,0.35)");
    ctx.fillStyle = lin(ctx, px - pr, py - pr, px + pr, py + pr, [
      [0, "#b9a2ff"],
      [0.45, "#5f3db8"],
      [1, "#1a0d3d"],
    ]);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(205,190,255,0.55)";
    ctx.lineWidth = Math.max(2, pr * 0.08);
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.7, pr * 0.4, -0.25, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.9, pr * 0.47, -0.25, 0, TAU);
    ctx.stroke();
  }

  function drawJellyfish(ctx, w, h, t, duration, seed = 51) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#07384a"],
      [0.22, "#06283f"],
      [0.62, "#04142b"],
      [1, "#01030b"],
    ]);
    ctx.fillRect(0, 0, w, h);
    lightRays(ctx, w, h, w * 0.56, -h * 0.15, "rgba(140,245,255,0.22)", 0.7, 9);
    // Surface caustics.
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 14; i += 1) {
      const x = (w / 14) * i + Math.sin(TAU * phase + i) * w * 0.025;
      const grad = ctx.createLinearGradient(x, 0, x, h * 0.55);
      grad.addColorStop(0, "rgba(130,240,255,0.14)");
      grad.addColorStop(1, "rgba(130,240,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = w * 0.006;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + w * 0.06, h * 0.22, x - w * 0.03, h * 0.56);
      ctx.stroke();
    }
    ctx.restore();
    // Distant haze.
    for (let i = 0; i < 8; i += 1) {
      glow(ctx, random() * w, h * (0.25 + random() * 0.5), w * (0.04 + random() * 0.09), "rgba(45,100,180,0.35)", 0.35);
    }
    for (let i = 0; i < 9; i += 1) {
      const cx = w * (0.12 + random() * 0.76);
      const cy = h * (0.18 + random() * 0.58);
      const size = Math.min(w, h) * (0.03 + random() * 0.085);
      const drift = Math.sin(TAU * phase + i * 1.7) * size * 0.22;
      const pulse = 1 + Math.sin(TAU * (t / duration) + i) * 0.055;
      const bellX = cx + drift;
      const bellY = cy;
      ctx.save();
      ctx.globalAlpha = 0.55 + random() * 0.35;
      glow(ctx, bellX, bellY, size * 4.4, "rgba(95,120,255,0.48)", 0.6);
      const bellGrad = ctx.createLinearGradient(bellX, bellY - size, bellX, bellY + size * 0.7);
      bellGrad.addColorStop(0, "rgba(240,235,255,0.55)");
      bellGrad.addColorStop(0.45, "rgba(145,145,255,0.28)");
      bellGrad.addColorStop(1, "rgba(60,45,130,0.03)");
      ctx.fillStyle = bellGrad;
      ctx.beginPath();
      ctx.ellipse(bellX, bellY, size * pulse, size * 0.74 * pulse, 0, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(225,220,255,0.55)";
      ctx.lineWidth = Math.max(1, size * 0.028);
      ctx.beginPath();
      ctx.ellipse(bellX, bellY, size * pulse, size * 0.74 * pulse, 0, Math.PI, TAU);
      ctx.stroke();
      // Inner organs and rim light.
      for (let k = 0; k < 4; k += 1) {
        ctx.strokeStyle = `rgba(255,220,255,${0.24 - k * 0.04})`;
        ctx.lineWidth = Math.max(1, size * 0.018);
        ctx.beginPath();
        ctx.ellipse(bellX, bellY - size * 0.06, size * (0.18 + k * 0.1), size * (0.06 + k * 0.02), 0, Math.PI, TAU);
        ctx.stroke();
      }
      // Tentacles with varied length/opacity.
      const count = 11;
      for (let j = 0; j < count; j += 1) {
        const tx = bellX + (j - (count - 1) / 2) * size * 0.13;
        const sway = Math.sin(TAU * phase + i + j * 0.55) * size * 0.22;
        const length = size * (1.3 + random() * 1.2);
        ctx.strokeStyle = `rgba(195,185,255,${0.18 + random() * 0.25})`;
        ctx.lineWidth = Math.max(0.7, size * 0.022);
        ctx.beginPath();
        ctx.moveTo(tx, bellY + size * 0.2);
        ctx.bezierCurveTo(tx + sway, bellY + length * 0.5, tx - sway, bellY + length * 0.95, tx + sway * 0.4, bellY + length);
        ctx.stroke();
      }
      // Thicker oral arms.
      for (let j = 0; j < 4; j += 1) {
        const tx = bellX + (j - 1.5) * size * 0.14;
        const sway = Math.sin(TAU * phase + i + j) * size * 0.16;
        ctx.strokeStyle = "rgba(215,195,255,0.2)";
        ctx.lineWidth = Math.max(1.2, size * 0.06);
        ctx.beginPath();
        ctx.moveTo(tx, bellY + size * 0.1);
        ctx.bezierCurveTo(tx + sway, bellY + size * 0.6, tx - sway, bellY + size * 1.1, tx + sway * 0.5, bellY + size * 1.45);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Bubbles and marine snow.
    for (let i = 0; i < 60; i += 1) {
      const x = random() * w;
      const base = random() * h;
      const y = h - ((base + phase * h * (0.7 + random() * 0.4)) % (h + 40));
      const r = Math.max(0.7, w * (0.0015 + random() * 0.005));
      ctx.strokeStyle = `rgba(190,245,255,${0.08 + random() * 0.22})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 45; i += 1) {
      ctx.fillStyle = `rgba(200,230,255,${0.08 + random() * 0.18})`;
      ctx.beginPath();
      ctx.arc(random() * w, random() * h, w * 0.0008, 0, TAU);
      ctx.fill();
    }
  }

  function drawFloatingIsles(ctx, w, h, t, duration, seed = 61) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#1c1038"],
      [0.28, "#4d2861"],
      [0.55, "#b15f7d"],
      [0.76, "#f2a177"],
      [1, "#2a1431"],
    ]);
    ctx.fillRect(0, 0, w, h);
    starField(ctx, w, h, seed + 2, 80, t, duration, { band: 0.45, maxRadius: 0.9 });
    cloudBank(ctx, w, h, h * 0.43, seed + 4, "rgba(255,206,196,0.9)", 0.18, 14);
    cloudBank(ctx, w, h, h * 0.62, seed + 6, "rgba(255,180,170,0.9)", 0.2, 12);
    glow(ctx, w * 0.7, h * 0.46, w * 0.3, "rgba(255,220,170,0.65)");
    ctx.fillStyle = "rgba(255,240,205,0.95)";
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.46, w * 0.055, 0, TAU);
    ctx.fill();
    lightRays(ctx, w, h, w * 0.7, h * 0.35, "rgba(255,225,180,0.2)", 0.5, 6);

    const islands = [
      { x: 0.2, y: 0.37, w: 0.24, d: 0.8, trees: 7 },
      { x: 0.77, y: 0.33, w: 0.2, d: 0.65, trees: 5 },
      { x: 0.48, y: 0.53, w: 0.3, d: 1, trees: 9 },
      { x: 0.88, y: 0.63, w: 0.14, d: 0.5, trees: 3 },
    ];
    for (let i = 0; i < islands.length; i += 1) {
      const island = islands[i];
      const ix = w * island.x + Math.sin(TAU * phase + i) * w * 0.006;
      const iy = h * island.y;
      const iw = w * island.w * island.d;
      const ih = iw * 0.3;
      const topY = iy;
      // Underside with strata.
      const rock = ctx.createLinearGradient(ix, topY, ix, topY + ih * 4.2);
      rock.addColorStop(0, "#3b2c42");
      rock.addColorStop(0.35, "#241a30");
      rock.addColorStop(1, "#0c0713");
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.moveTo(ix - iw / 2, topY);
      ctx.quadraticCurveTo(ix - iw * 0.44, topY + ih * 1.5, ix - iw * 0.18, topY + ih * 2.6);
      ctx.quadraticCurveTo(ix, topY + ih * 4.1, ix + iw * 0.16, topY + ih * 2.5);
      ctx.quadraticCurveTo(ix + iw * 0.42, topY + ih * 1.3, ix + iw / 2, topY);
      ctx.closePath();
      ctx.fill();
      for (let s = 0; s < 5; s += 1) {
        ctx.strokeStyle = `rgba(120,90,120,${0.12 - s * 0.018})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ix - iw * (0.36 - s * 0.04), topY + ih * (0.35 + s * 0.35));
        ctx.quadraticCurveTo(ix, topY + ih * (0.6 + s * 0.35), ix + iw * (0.32 - s * 0.03), topY + ih * (0.28 + s * 0.3));
        ctx.stroke();
      }
      // Grass cap and rim.
      const cap = ctx.createLinearGradient(ix, topY - ih * 0.4, ix, topY + ih * 0.15);
      cap.addColorStop(0, "#9bc47d");
      cap.addColorStop(1, "#3d6a4c");
      ctx.fillStyle = cap;
      ctx.beginPath();
      ctx.ellipse(ix, topY, iw / 2, ih * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(220,255,190,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ix, topY - ih * 0.03, iw * 0.48, ih * 0.5, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      // Detailed trees.
      for (let j = 0; j < island.trees; j += 1) {
        const tx = ix - iw * 0.38 + (j / Math.max(1, island.trees - 1)) * iw * 0.76;
        const ty = topY - ih * 0.08 + (random() - 0.5) * ih * 0.12;
        const size = ih * (0.55 + random() * 0.5);
        ctx.fillStyle = "#1b2e24";
        ctx.fillRect(tx - size * 0.04, ty - size * 0.7, size * 0.08, size * 0.7);
        for (let k = 0; k < 4; k += 1) {
          ctx.fillStyle = k % 2 ? "rgba(54,95,63,0.95)" : "rgba(38,72,50,0.95)";
          ctx.beginPath();
          ctx.arc(tx + (random() - 0.5) * size * 0.5, ty - size * (0.7 + random() * 0.45), size * (0.22 + random() * 0.15), 0, TAU);
          ctx.fill();
        }
      }
      // Ruined arch.
      if (i === 2) {
        ctx.fillStyle = "rgba(232,211,178,0.92)";
        ctx.fillRect(ix + iw * 0.2, topY - ih * 0.9, iw * 0.055, ih * 0.8);
        ctx.fillRect(ix + iw * 0.32, topY - ih * 0.9, iw * 0.045, ih * 0.8);
        ctx.fillRect(ix + iw * 0.18, topY - ih * 0.95, iw * 0.22, ih * 0.08);
      }
      // Multi-stream waterfall with mist.
      const streamX = ix + iw * (i === 2 ? 0.04 : -0.12);
      const water = ctx.createLinearGradient(streamX, topY, streamX, topY + ih * 4.5);
      water.addColorStop(0, "rgba(230,255,255,0.95)");
      water.addColorStop(0.5, "rgba(160,235,255,0.65)");
      water.addColorStop(1, "rgba(100,200,240,0)");
      ctx.fillStyle = water;
      ctx.beginPath();
      ctx.moveTo(streamX - iw * 0.035, topY + ih * 0.1);
      ctx.quadraticCurveTo(streamX - iw * 0.1, topY + ih * 1.8, streamX - iw * 0.02, topY + ih * 3.4);
      ctx.lineTo(streamX + iw * 0.04, topY + ih * 3.4);
      ctx.quadraticCurveTo(streamX + iw * 0.04, topY + ih * 1.8, streamX + iw * 0.03, topY + ih * 0.1);
      ctx.closePath();
      ctx.fill();
      fogBand(ctx, w, h, topY + ih * 3.4, ih * 0.8, "rgba(220,240,255,0.8)", 0.2);
    }
    cloudBank(ctx, w, h, h * 0.8, seed + 21, "rgba(255,200,190,0.9)", 0.22, 10);
    for (let i = 0; i < 10; i += 1) {
      const bx = w * (0.08 + random() * 0.84) + Math.sin(TAU * phase + i) * w * 0.01;
      const by = h * (0.15 + random() * 0.34);
      bird(ctx, bx, by, w * 0.006, "#1d1424", 0.55);
    }
  }

  function drawSunsetStation(ctx, w, h, t, duration, seed = 71) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#1a1733"],
      [0.3, "#6b385e"],
      [0.62, "#f4a06e"],
      [1, "#291728"],
    ]);
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.62, h * 0.45, w * 0.28, "rgba(255,220,150,0.6)");
    ctx.fillStyle = "rgba(255,236,190,0.85)";
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.45, w * 0.05, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 6; i += 1) {
      cloud(ctx, w * (0.12 + random() * 0.8), h * (0.16 + random() * 0.25), w * (0.07 + random() * 0.1), "#ffd2b8", 0.14 + random() * 0.2);
    }
    // Distant city.
    ctx.fillStyle = "rgba(30,21,45,0.8)";
    for (let x = 0; x < w; x += w * 0.045) {
      const bh = h * (0.06 + random() * 0.1);
      ctx.fillRect(x, h * 0.62 - bh, w * 0.04, bh);
    }
    // Platform, canopy, pillars.
    ctx.fillStyle = "#130e1b";
    ctx.fillRect(0, h * 0.74, w, h * 0.26);
    ctx.fillRect(0, h * 0.2, w * 0.08, h * 0.55);
    ctx.fillRect(w * 0.92, h * 0.2, w * 0.08, h * 0.55);
    ctx.fillStyle = "#21182a";
    ctx.fillRect(0, h * 0.18, w, h * 0.055);
    for (let i = 0; i < 5; i += 1) {
      const px = w * (0.15 + i * 0.17);
      ctx.fillRect(px, h * 0.22, w * 0.012, h * 0.54);
      glow(ctx, px + w * 0.006, h * 0.25, w * 0.035, "rgba(255,200,120,0.45)");
    }
    // Train on the right.
    ctx.fillStyle = "#16101e";
    ctx.beginPath();
    ctx.roundRect(w * 0.66, h * 0.52, w * 0.3, h * 0.25, w * 0.025);
    ctx.fill();
    ctx.fillStyle = "#2a1c32";
    ctx.fillRect(w * 0.68, h * 0.28, w * 0.012, h * 0.25);
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i % 2 ? "rgba(255,205,130,0.9)" : "rgba(140,225,255,0.6)";
      ctx.fillRect(w * (0.69 + i * 0.052), h * 0.585, w * 0.034, h * 0.055);
    }
    // Tracks.
    ctx.strokeStyle = "rgba(230,200,190,0.25)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, h * (0.88 + i * 0.06));
      ctx.lineTo(w, h * (0.82 + i * 0.06));
      ctx.stroke();
    }
    // Falling leaves.
    for (let i = 0; i < 28; i += 1) {
      const x = ((random() * w + phase * w * 0.1) % w);
      const y = ((random() * h + phase * h * 0.5) % (h * 0.8)) + h * 0.1;
      petal(ctx, x, y, w * (0.004 + random() * 0.005), phase * TAU + i, random() > 0.45 ? "#f4a24c" : "#d56a4d", 0.7);
    }
  }

  function drawForestLight(ctx, w, h, t, duration, seed = 81) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#07130e"],
      [0.5, "#12261b"],
      [1, "#050b08"],
    ]);
    ctx.fillRect(0, 0, w, h);
    // Canopy.
    ctx.fillStyle = "rgba(10,28,18,0.8)";
    for (let i = 0; i < 16; i += 1) {
      ctx.beginPath();
      ctx.ellipse(random() * w, h * (0.04 + random() * 0.18), w * (0.1 + random() * 0.12), h * (0.06 + random() * 0.1), 0, 0, TAU);
      ctx.fill();
    }
    lightRays(ctx, w, h, w * 0.36, -h * 0.1, "rgba(220,255,170,0.22)", 0.55, 7);
    // Trunks.
    for (let i = 0; i < 9; i += 1) {
      const x = w * (0.05 + random() * 0.9);
      const tw = w * (0.012 + random() * 0.03);
      const lean = (random() - 0.5) * w * 0.06;
      ctx.fillStyle = i % 2 ? "#142016" : "#0d170f";
      ctx.beginPath();
      ctx.moveTo(x - tw, h);
      ctx.lineTo(x - tw * 0.55 + lean, h * 0.08);
      ctx.lineTo(x + tw * 0.55 + lean, h * 0.08);
      ctx.lineTo(x + tw, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(80,105,70,0.25)";
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k += 1) {
        const bx = x + (random() - 0.5) * tw;
        ctx.beginPath();
        ctx.moveTo(bx, h * (0.2 + k * 0.18));
        ctx.lineTo(bx + lean * 0.3, h * (0.3 + k * 0.18));
        ctx.stroke();
      }
    }
    // Ferns and ground.
    ctx.fillStyle = "#0a150d";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.8);
    for (let i = 0; i <= 10; i += 1) ctx.lineTo((w / 10) * i, h * (0.78 + random() * 0.08));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 38; i += 1) {
      const fx = random() * w;
      const fy = h * (0.8 + random() * 0.18);
      ctx.strokeStyle = "rgba(70,120,68,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx - w * 0.02, fy - h * 0.04, fx + w * 0.01, fy - h * 0.08);
      ctx.stroke();
    }
    // Dust motes in the light.
    for (let i = 0; i < 80; i += 1) {
      const x = w * (0.15 + random() * 0.55) + Math.sin(TAU * phase + i) * w * 0.01;
      const y = h * (0.1 + random() * 0.7) - phase * h * 0.06;
      const r = Math.max(0.5, w * (0.0007 + random() * 0.0018));
      glow(ctx, x, y, r * 5, "rgba(245,255,190,0.6)", 0.5);
      ctx.fillStyle = "rgba(255,255,220,0.7)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  function drawFlowerField(ctx, w, h, t, duration, seed = 91) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#241235"],
      [0.35, "#8a3e79"],
      [0.62, "#f19a8c"],
      [1, "#351a3f"],
    ]);
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.5, h * 0.55, w * 0.3, "rgba(255,210,180,0.45)");
    ctx.fillStyle = "rgba(255,225,180,0.55)";
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.55, w * 0.045, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#24142e";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.63);
    for (let i = 0; i <= 8; i += 1) ctx.lineTo((w / 8) * i, h * (0.58 + random() * 0.1));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    // Foreground field.
    ctx.fillStyle = "#170c20";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.76);
    ctx.quadraticCurveTo(w * 0.5, h * 0.68, w, h * 0.78);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 95; i += 1) {
      const x = random() * w;
      const baseY = h * (0.8 + random() * 0.18);
      const stem = h * (0.04 + random() * 0.16);
      const sway = Math.sin(TAU * phase + i) * w * 0.005;
      ctx.strokeStyle = "rgba(30,45,30,0.8)";
      ctx.lineWidth = Math.max(1, w * 0.0015);
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x + sway, baseY - stem * 0.5, x + sway * 1.8, baseY - stem);
      ctx.stroke();
      const colors = ["#ffc0d8", "#ffd8a8", "#f08cbf", "#f7e2ff"];
      const color = colors[Math.floor(random() * colors.length)];
      for (let p = 0; p < 5; p += 1) {
        const a = (p / 5) * TAU;
        petal(ctx, x + sway * 1.8 + Math.cos(a) * w * 0.008, baseY - stem + Math.sin(a) * h * 0.008, w * 0.006, a, color, 0.8);
      }
    }
    for (let i = 0; i < 55; i += 1) {
      const x = ((random() * w + phase * w * 0.2) % w);
      const y = ((random() * h + phase * h * 0.35) % (h * 0.9));
      petal(ctx, x, y, w * (0.004 + random() * 0.009), phase * TAU + i, random() > 0.5 ? "#ffd0e0" : "#ffb4cd", 0.55 + random() * 0.4);
    }
    for (let i = 0; i < 14; i += 1) {
      glow(ctx, random() * w, h * (0.2 + random() * 0.5), w * (0.008 + random() * 0.02), "rgba(255,220,180,0.5)", 0.25);
    }
  }

  function drawMountainLake(ctx, w, h, t, duration, seed = 101) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    ctx.fillStyle = lin(ctx, 0, 0, 0, h * 0.7, [
      [0, "#0d1634"],
      [0.32, "#31456d"],
      [0.65, "#9d7f9e"],
      [1, "#f3b58d"],
    ]);
    ctx.fillRect(0, 0, w, h);
    starField(ctx, w, h, seed + 5, 120, t, duration, { band: 0.42, maxRadius: 0.9 });
    cloudBank(ctx, w, h, h * 0.28, seed + 7, "rgba(240,210,220,0.8)", 0.1, 10);
    cloudBank(ctx, w, h, h * 0.4, seed + 9, "rgba(255,210,180,0.85)", 0.13, 7);
    glow(ctx, w * 0.68, h * 0.38, w * 0.25, "rgba(255,220,170,0.65)");
    ctx.fillStyle = "rgba(255,240,210,0.92)";
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.38, w * 0.042, 0, TAU);
    ctx.fill();

    smoothRidge(ctx, w, h, h * 0.57, h * 0.27, "#816d87", seed + 1, 8);
    smoothRidge(ctx, w, h, h * 0.62, h * 0.21, "#4d4466", seed + 2, 9);
    smoothRidge(ctx, w, h, h * 0.67, h * 0.14, "#25233d", seed + 3, 10);
    fogBand(ctx, w, h, h * 0.64, h * 0.05, "rgba(245,214,210,0.8)", 0.25);
    // Lake with a blurred mirrored ridge.
    ctx.fillStyle = lin(ctx, 0, h * 0.68, 0, h, [
      [0, "#3b3a5c"],
      [0.45, "#19192e"],
      [1, "#070711"],
    ]);
    ctx.fillRect(0, h * 0.68, w, h * 0.32);
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.filter = "blur(4px)";
    ctx.scale(1, -1);
    ctx.translate(0, -h * 1.36);
    smoothRidge(ctx, w, h, h * 0.67, h * 0.14, "#7b6a8d", seed + 3, 10);
    ctx.restore();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 25; i += 1) {
      const y = h * (0.7 + random() * 0.27);
      ctx.strokeStyle = `rgba(245,224,210,${0.04 + random() * 0.11})`;
      ctx.lineWidth = 0.8 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(w * (0.08 + random() * 0.84), y);
      ctx.lineTo(w * (0.08 + random() * 0.9), y);
      ctx.stroke();
    }
    // Foreground bank, detailed pines and grass.
    ctx.fillStyle = "#070a10";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.8);
    for (let i = 0; i <= 10; i += 1) {
      ctx.lineTo((w / 10) * i, h * (0.78 + random() * 0.06));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 18; i += 1) {
      const x = w * (0.01 + random() * 0.98);
      const y = h * (0.84 + random() * 0.13);
      pine(ctx, x, y, h * (0.045 + random() * 0.1), "#060810");
    }
    for (let i = 0; i < 120; i += 1) {
      const x = random() * w;
      const y = h * (0.79 + random() * 0.18);
      ctx.strokeStyle = "rgba(90,120,90,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(TAU * phase + i) * w * 0.004, y - h * 0.02, x + Math.sin(TAU * phase + i) * w * 0.01, y - h * 0.04);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i += 1) {
      bird(ctx, w * (0.55 + random() * 0.3), h * (0.18 + random() * 0.08), w * 0.006, "#141428", 0.55);
    }
  }

  function drawFourSeasons(ctx, w, h, t, duration, seed = 111) {
    const panels = [
      { sky: ["#3b2148", "#f3b6cf"], hill: "#5a3850", tree: "#2c1a2a", leaf: "#ffb6cf" },
      { sky: ["#1d4a5c", "#bfe3b1"], hill: "#2d493d", tree: "#1b2f25", leaf: "#9bd08b" },
      { sky: ["#4d2a20", "#f6b56f"], hill: "#5a3626", tree: "#2e1b14", leaf: "#ffb45c" },
      { sky: ["#18263d", "#a9c9e8"], hill: "#2b3b50", tree: "#121b28", leaf: "#dceeff" },
    ];
    const pw = w / 4;
    panels.forEach((panel, index) => {
      ctx.save();
      ctx.translate(index * pw, 0);
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
        [0, panel.sky[0]],
        [1, panel.sky[1]],
      ]);
      ctx.fillRect(0, 0, pw, h);
      const sunX = pw * (0.35 + index * 0.08);
      glow(ctx, sunX, h * 0.3, pw * 0.45, "rgba(255,245,220,0.4)");
      ctx.fillStyle = "rgba(255,250,230,0.65)";
      ctx.beginPath();
      ctx.arc(sunX, h * 0.3, pw * 0.09, 0, TAU);
      ctx.fill();
      mountainRange(ctx, pw + 2, h, h * 0.58, h * 0.18, panel.hill, seed + index, 4);
      ctx.fillStyle = panel.hill;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      ctx.quadraticCurveTo(pw * 0.5, h * 0.63, pw, h * 0.72);
      ctx.lineTo(pw, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      // Tree.
      const tx = pw * 0.5;
      const ty = h * 0.8;
      ctx.fillStyle = panel.tree;
      ctx.fillRect(tx - pw * 0.03, ty - h * 0.25, pw * 0.06, h * 0.25);
      for (let i = 0; i < 14; i += 1) {
        const angle = (i / 14) * TAU;
        ctx.beginPath();
        ctx.arc(tx + Math.cos(angle) * pw * 0.13, ty - h * 0.27 + Math.sin(angle) * h * 0.09, pw * (0.035 + (i % 3) * 0.01), 0, TAU);
        ctx.fill();
      }
      for (let i = 0; i < 18; i += 1) {
        const random = rng(seed + index * 13 + i);
        ctx.fillStyle = panel.leaf;
        ctx.globalAlpha = 0.35 + random() * 0.45;
        ctx.beginPath();
        ctx.arc(tx + (random() - 0.5) * pw * 0.42, ty - h * (0.2 + random() * 0.2), pw * (0.006 + random() * 0.014), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });
    // Thin separators.
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo((w / 4) * i, 0);
      ctx.lineTo((w / 4) * i, h);
      ctx.stroke();
    }
  }

  function drawArchitectureMinimal(ctx, w, h, t, duration, _seed = 121) {
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#203144"],
      [0.55, "#86a0ad"],
      [1, "#d7c7b3"],
    ]);
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w * 0.22, h * 0.22, w * 0.25, "rgba(255,235,200,0.35)");
    // Geometric massing.
    ctx.fillStyle = "#b9a48d";
    ctx.fillRect(w * 0.1, h * 0.22, w * 0.48, h * 0.54);
    ctx.fillStyle = "#d8c5aa";
    ctx.fillRect(w * 0.22, h * 0.13, w * 0.42, h * 0.22);
    ctx.fillStyle = "#8f7b68";
    ctx.fillRect(w * 0.1, h * 0.64, w * 0.48, h * 0.08);
    ctx.fillStyle = "#3b4650";
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(w * (0.18 + i * 0.075), h * 0.36, w * 0.035, h * 0.18);
    }
    ctx.fillStyle = "#2f3a44";
    ctx.fillRect(w * 0.62, h * 0.3, w * 0.16, h * 0.52);
    ctx.fillStyle = "#f0ddc2";
    ctx.fillRect(w * 0.65, h * 0.34, w * 0.1, h * 0.04);
    // Reflecting pool.
    ctx.fillStyle = lin(ctx, 0, h * 0.72, 0, h, [
      [0, "#596b74"],
      [1, "#1e2933"],
    ]);
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#b9a48d";
    ctx.fillRect(w * 0.12, h * 0.72, w * 0.44, h * 0.16);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 7; i += 1) {
      ctx.strokeStyle = "rgba(245,235,220,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * (0.15 + i * 0.08), h * 0.76);
      ctx.lineTo(w * (0.2 + i * 0.08), h * 0.76);
      ctx.stroke();
    }
    // Lone tree.
    ctx.fillStyle = "#3b3128";
    ctx.fillRect(w * 0.84, h * 0.62, w * 0.012, h * 0.2);
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = "rgba(79,101,77,0.9)";
      ctx.beginPath();
      ctx.arc(w * 0.846 + Math.cos(i) * w * 0.055, h * 0.6 + Math.sin(i) * h * 0.05, w * 0.018, 0, TAU);
      ctx.fill();
    }
    // Long shadow.
    ctx.fillStyle = "rgba(20,22,25,0.2)";
    ctx.beginPath();
    ctx.moveTo(w * 0.58, h * 0.76);
    ctx.lineTo(w * 0.78, h * 0.72);
    ctx.lineTo(w * 0.95, h * 0.8);
    ctx.closePath();
    ctx.fill();
  }

  function drawMacroNature(ctx, w, h, t, duration, seed = 131) {
    const random = rng(seed);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
      [0, "#10251c"],
      [0.6, "#1b3b2b"],
      [1, "#08130e"],
    ]);
    ctx.fillRect(0, 0, w, h);
    // Large fern fronds.
    for (let f = 0; f < 5; f += 1) {
      const baseX = w * (0.1 + f * 0.2);
      const baseY = h * (1.0 - f * 0.03);
      const angle = -Math.PI / 2 + (f - 2) * 0.22;
      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(angle);
      const len = h * (0.65 + random() * 0.2);
      ctx.strokeStyle = "rgba(110,170,105,0.65)";
      ctx.lineWidth = Math.max(2, w * 0.006);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(w * 0.05, -len * 0.5, w * 0.02, -len);
      ctx.stroke();
      for (let i = 0; i < 16; i += 1) {
        const p = i / 16;
        const lx = w * 0.02 * p;
        const ly = -len * p;
        const leafLen = len * (0.09 + 0.1 * Math.sin(Math.PI * p));
        ctx.fillStyle = `rgba(55,120,75,${0.45 + random() * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(lx - leafLen * 0.4, ly, leafLen, w * 0.008, -0.45, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(lx + leafLen * 0.4, ly, leafLen, w * 0.008, 0.45, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // Dew drops.
    for (let i = 0; i < 22; i += 1) {
      const x = random() * w;
      const y = random() * h * 0.8;
      const r = w * (0.006 + random() * 0.018);
      const grad = rad(ctx, x, y, 0, r, [
        [0, "rgba(255,255,240,0.7)"],
        [0.35, "rgba(170,240,190,0.35)"],
        [1, "rgba(10,40,25,0.1)"],
      ]);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.7, r, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y - r * 0.35, r * 0.16, 0, TAU);
      ctx.fill();
    }
    // Bokeh.
    for (let i = 0; i < 12; i += 1) {
      glow(ctx, random() * w, h * (0.05 + random() * 0.4), w * (0.015 + random() * 0.04), "rgba(220,255,190,0.4)", 0.25);
    }
  }

  function drawSoftGradient(ctx, w, h, t, duration, _seed = 141) {
    ctx.fillStyle = "#080611";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const blobs = [
      [0.22, 0.3, "rgba(255,60,150,0.3)"],
      [0.78, 0.2, "rgba(90,80,255,0.28)"],
      [0.55, 0.75, "rgba(255,170,90,0.2)"],
      [0.18, 0.8, "rgba(50,210,255,0.18)"],
    ];
    for (const [bx, by, color] of blobs) {
      const r = Math.min(w, h) * 0.55;
      ctx.fillStyle = rad(ctx, w * bx, h * by, 0, r, [
        [0, color],
        [1, "rgba(0,0,0,0)"],
      ]);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
    // Flowing translucent bands.
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      const y = h * (0.25 + i * 0.13);
      ctx.moveTo(-w * 0.1, y);
      for (let x = 0; x <= w * 1.2; x += w * 0.1) {
        ctx.lineTo(x, y + Math.sin(x / w * TAU + i) * h * 0.03);
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + i * 0.01})`;
      ctx.lineWidth = Math.max(1, w * 0.003);
      ctx.stroke();
    }
    glow(ctx, w * 0.52, h * 0.48, w * 0.16, "rgba(255,255,255,0.35)");
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(w * 0.52, h * 0.48, w * 0.07, 0, TAU);
    ctx.fill();
  }

  function drawAbstractLight(ctx, w, h, t, duration, seed = 151) {
    const random = rng(seed);
    ctx.fillStyle = "#05030b";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 8; i += 1) {
      const y = h * (0.2 + i * 0.09);
      const grad = ctx.createLinearGradient(0, y, w, y + h * 0.1);
      const c = ["255,70,180", "70,170,255", "255,190,90", "150,90,255"][i % 4];
      grad.addColorStop(0, `rgba(${c},0)`);
      grad.addColorStop(0.45, `rgba(${c},0.35)`);
      grad.addColorStop(1, `rgba(${c},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2, h * (0.006 + random() * 0.018));
      ctx.beginPath();
      ctx.moveTo(-w * 0.1, y);
      ctx.bezierCurveTo(w * 0.3, y - h * 0.18, w * 0.6, y + h * 0.18, w * 1.1, y - h * 0.05);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 46; i += 1) {
      glow(ctx, random() * w, random() * h, w * (0.002 + random() * 0.006), "rgba(255,255,255,0.7)", 0.5);
    }
  }

  function drawSchoolLife(ctx, w, h, t, duration, seed = 161) {
    const random = rng(seed);
    const phase = (t / duration) % 1;
    // Warm classroom interior.
    ctx.fillStyle = lin(ctx, 0, 0, w, h, [
      [0, "#2d2b3e"],
      [0.45, "#5a4a52"],
      [1, "#2a202c"],
    ]);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = lin(ctx, 0, h * 0.68, 0, h, [
      [0, "#6f5848"],
      [1, "#2a1d20"],
    ]);
    ctx.fillRect(0, h * 0.68, w, h * 0.32);
    // Chalkboard.
    ctx.fillStyle = "#263f38";
    ctx.beginPath();
    ctx.roundRect(w * 0.04, h * 0.14, w * 0.38, h * 0.36, w * 0.01);
    ctx.fill();
    ctx.strokeStyle = "rgba(220,205,170,0.28)";
    ctx.lineWidth = Math.max(1, w * 0.002);
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w * (0.08 + i * 0.055), h * 0.2);
      ctx.lineTo(w * (0.1 + i * 0.055), h * 0.27);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(230,220,190,0.22)";
    ctx.fillRect(w * 0.08, h * 0.4, w * 0.25, h * 0.012);
    // Window with sunset.
    const wx = w * 0.47;
    const wy = h * 0.08;
    const ww = w * 0.46;
    const wh = h * 0.52;
    ctx.fillStyle = "#1c1a2b";
    ctx.fillRect(wx - w * 0.02, wy - h * 0.02, ww + w * 0.04, wh + h * 0.04);
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, "#4b5b8d");
    sky.addColorStop(0.35, "#c17888");
    sky.addColorStop(0.68, "#f2b18f");
    sky.addColorStop(1, "#f9d5ad");
    ctx.fillStyle = sky;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx, wy, ww, wh);
    ctx.clip();
    glow(ctx, wx + ww * 0.7, wy + wh * 0.6, ww * 0.2, "rgba(255,235,190,0.6)");
    ctx.fillStyle = "rgba(255,245,210,0.9)";
    ctx.beginPath();
    ctx.arc(wx + ww * 0.7, wy + wh * 0.6, w * 0.045, 0, TAU);
    ctx.fill();
    cloudBank(ctx, w, h, wy + wh * 0.33, seed + 3, "rgba(255,220,210,0.9)", 0.3, 8);
    // Distant school roof and cherry tree outside.
    ctx.fillStyle = "rgba(80,63,79,0.7)";
    ctx.fillRect(wx + ww * 0.02, wy + wh * 0.72, ww * 0.5, wh * 0.28);
    branch(ctx, wx + ww * 0.84, wy + wh * 0.9, -1.25, wh * 0.42, w * 0.016, 6, rng(seed + 8), {
      bark: "#5a3b47",
      blossom: "#ffd1df",
      blossom2: "#ef9fbd",
    });
    ctx.restore();
    // Window frame and mullions.
    ctx.strokeStyle = "#262231";
    ctx.lineWidth = Math.max(3, w * 0.01);
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.lineWidth = Math.max(2, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy);
    ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh * 0.45);
    ctx.lineTo(wx + ww, wy + wh * 0.45);
    ctx.stroke();
    // Curtains with folds, subtly moving.
    for (let side = 0; side < 2; side += 1) {
      const x = side === 0 ? wx - w * 0.03 : wx + ww - w * 0.06;
      const sway = Math.sin(TAU * phase + side) * w * 0.006;
      const grad = ctx.createLinearGradient(x, wy, x + w * 0.1, wy);
      grad.addColorStop(0, "rgba(240,225,205,0.9)");
      grad.addColorStop(0.5, "rgba(205,185,175,0.75)");
      grad.addColorStop(1, "rgba(150,130,135,0.65)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x + sway, wy - h * 0.02);
      ctx.quadraticCurveTo(x + w * 0.02 + sway, wy + wh * 0.4, x - w * 0.01 + sway, wy + wh * 0.75);
      ctx.lineTo(x + w * 0.08, wy + wh * 0.72);
      ctx.quadraticCurveTo(x + w * 0.06, wy + wh * 0.35, x + w * 0.09, wy - h * 0.02);
      ctx.closePath();
      ctx.fill();
    }
    // Light shafts.
    lightRays(ctx, w, h, wx + ww * 0.55, wy + wh * 0.2, "rgba(255,230,190,0.32)", 0.6, 5);
    // Desks in perspective.
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const dx = w * (0.08 + col * 0.2 + row * 0.08);
        const dy = h * (0.62 + row * 0.1);
        const dw = w * (0.22 - row * 0.025);
        const dh = h * 0.045;
        ctx.fillStyle = row % 2 ? "#5a4032" : "#6b4b37";
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + dw, dy - h * 0.012);
        ctx.lineTo(dx + dw + w * 0.03, dy + dh);
        ctx.lineTo(dx + w * 0.01, dy + dh + h * 0.012);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#2a1b18";
        ctx.fillRect(dx + w * 0.02, dy + dh * 0.7, w * 0.012, h * 0.12);
        ctx.fillRect(dx + dw - w * 0.02, dy + dh * 0.6, w * 0.012, h * 0.12);
        ctx.fillStyle = "rgba(255,225,180,0.14)";
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + dw, dy - h * 0.012);
        ctx.lineTo(dx + dw, dy + h * 0.004);
        ctx.lineTo(dx, dy + h * 0.016);
        ctx.closePath();
        ctx.fill();
      }
    }
    // School bag on the nearest desk.
    ctx.fillStyle = "#2a222c";
    ctx.beginPath();
    ctx.roundRect(w * 0.12, h * 0.6, w * 0.1, h * 0.09, w * 0.02);
    ctx.fill();
    ctx.strokeStyle = "#b99672";
    ctx.lineWidth = Math.max(1.5, w * 0.003);
    ctx.beginPath();
    ctx.arc(w * 0.17, h * 0.6, w * 0.035, Math.PI, TAU);
    ctx.stroke();
    // Dust in the sun.
    for (let i = 0; i < 70; i += 1) {
      const x = w * (0.42 + random() * 0.48) + Math.sin(TAU * phase + i) * w * 0.01;
      const y = h * (0.16 + random() * 0.55) - phase * h * 0.04;
      const r = Math.max(0.6, w * (0.0007 + random() * 0.0017));
      glow(ctx, x, y, r * 6, "rgba(255,245,205,0.55)", 0.45);
    }
    for (let i = 0; i < 28; i += 1) {
      const x = wx + ((random() * ww + phase * ww * 0.15) % ww);
      const y = wy + ((random() * wh + phase * wh * 0.2) % wh);
      petal(ctx, x, y, w * (0.003 + random() * 0.005), phase * TAU + i, random() > 0.5 ? "#ffd1e1" : "#f39cbe", 0.6);
    }
  }

  const SCENES = {
    nightSakura: drawNightSakura,
    neonRain: drawNeonRain,
    starDrift: drawStarDrift,
    jellyfish: drawJellyfish,
    floatingIsles: drawFloatingIsles,
    sunsetStation: drawSunsetStation,
    forestLight: drawForestLight,
    flowerField: drawFlowerField,
    mountainLake: drawMountainLake,
    fourSeasons: drawFourSeasons,
    architectureMinimal: drawArchitectureMinimal,
    macroNature: drawMacroNature,
    softGradient: drawSoftGradient,
    abstractLight: drawAbstractLight,
    schoolLife: drawSchoolLife,
  };

  function draw(name, ctx, w, h, t, duration, seed) {
    const scene = SCENES[name];
    if (!scene) throw new Error(`Unknown scene: ${name}`);
    ctx.clearRect(0, 0, w, h);
    scene(ctx, w, h, t, duration, seed);
    addGrain(ctx, w, h, 0.055);
    addVignette(ctx, w, h, name === "softGradient" || name === "abstractLight" ? 0.2 : 0.3);
  }

  async function renderStill(spec) {
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    draw(spec.scene, ctx, spec.width, spec.height, spec.time ?? 0, 5, spec.seed ?? 1);
    return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
  }

  async function renderPoster(spec) {
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    draw(spec.scene, ctx, spec.width, spec.height, spec.posterTime ?? 2.4, spec.duration ?? 5, spec.seed ?? 1);
    return canvas.toDataURL("image/jpeg", 0.93).split(",")[1];
  }

  async function renderVideo(spec) {
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(spec.fps ?? 30);
    const mime = "video/mp4;codecs=avc1.42E01E";
    if (!MediaRecorder.isTypeSupported(mime)) throw new Error("MP4/H.264 recording is unavailable");
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: spec.bitrate ?? 6_000_000,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    });
    recorder.start(1000);
    const duration = spec.duration ?? 5;
    const start = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        const elapsed = (performance.now() - start) / 1000;
        const t = Math.min(elapsed, duration);
        draw(spec.scene, ctx, spec.width, spec.height, t, duration, spec.seed ?? 1);
        if (elapsed < duration) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: "video/mp4" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return {
      base64: btoa(binary),
      bytes: bytes.length,
      mime: blob.type,
      durationSeconds: duration,
    };
  }

  /* ---- Photo-based motion demos (CC0/PD source photos + local overlays) ---- */
  let frameImage = null;

  function setFrame(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        frameImage = image;
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => reject(new Error("frame image failed to decode"));
      image.src = dataUrl;
    });
  }

  function drawPhotoBase(ctx, w, h, t, duration, spec) {
    if (!frameImage) throw new Error("frame image is not loaded");
    const phase = (t / duration) % 1;
    const zoom = (spec.zoom ?? 0.035) + (spec.zoomPulse ?? 0.018) * Math.sin(TAU * phase + 0.4);
    const cover = Math.max(w / frameImage.naturalWidth, h / frameImage.naturalHeight);
    const scale = cover * (1 + zoom);
    const dw = frameImage.naturalWidth * scale;
    const dh = frameImage.naturalHeight * scale;
    const dx = (w - dw) / 2 + Math.sin(TAU * phase) * w * (spec.pan ?? 0.008);
    const dy = (h - dh) / 2 + Math.cos(TAU * phase) * h * (spec.panY ?? 0.006);
    ctx.drawImage(frameImage, dx, dy, dw, dh);
    const tint = spec.tint;
    if (tint) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [
        [0, tint[0]],
        [0.55, tint[1] ?? "rgba(0,0,0,0)"],
        [1, tint[2] ?? "rgba(0,0,0,0)"],
      ]);
      ctx.fillRect(0, 0, w, h);
    }
  }

  function photoPetals(ctx, w, h, t, duration, count, colors) {
    const random = rng(707);
    const phase = (t / duration) % 1;
    for (let i = 0; i < count; i += 1) {
      const baseX = random() * w;
      const baseY = random() * h;
      const speed = 0.25 + random() * 0.75;
      const x = baseX + Math.sin(TAU * phase * (0.5 + random()) + i) * w * 0.025;
      const y = ((baseY + phase * h * speed) % (h + h * 0.12)) - h * 0.06;
      petal(ctx, x, y, w * (0.0025 + random() * 0.004), phase * TAU * (1 + random()) + i, colors[Math.floor(random() * colors.length)], 0.32 + random() * 0.35);
    }
  }

  function photoRain(ctx, w, h, t, duration) {
    const random = rng(717);
    const phase = (t / duration) % 1;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 170; i += 1) {
      const x = random() * w;
      const base = random() * h;
      const len = h * (0.012 + random() * 0.04);
      const y = ((base + phase * h * 1.35) % (h + len)) - len;
      ctx.strokeStyle = `rgba(170,215,255,${0.06 + random() * 0.2})`;
      ctx.lineWidth = Math.max(0.5, w * 0.00065);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - w * 0.006, y + len);
      ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 16; i += 1) {
      const x = random() * w;
      const y = h * (0.72 + random() * 0.27);
      const pulse = 0.25 + 0.75 * Math.abs(Math.sin(TAU * phase + i));
      glow(ctx, x, y, w * (0.006 + random() * 0.018), i % 2 ? "rgba(255,45,170,0.4)" : "rgba(50,220,255,0.35)", pulse * 0.5);
    }
  }

  function photoStars(ctx, w, h, t, duration) {
    starField(ctx, w, h, 901, 150, t, duration, { band: 0.9, maxRadius: 1.1 });
    const phase = (t / duration) % 1;
    for (let i = 0; i < 2; i += 1) {
      const cycle = (phase + i * 0.5) % 1;
      if (cycle < 0.2) {
        const p = cycle / 0.2;
        const sx = w * (0.22 + i * 0.4) + p * w * 0.2;
        const sy = h * (0.18 + i * 0.2) + p * h * 0.15;
        const grad = ctx.createLinearGradient(sx, sy, sx - w * 0.18, sy - h * 0.1);
        grad.addColorStop(0, "rgba(255,255,255,0.85)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(1, w * 0.0014);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - w * 0.18, sy - h * 0.1);
        ctx.stroke();
      }
    }
  }

  function photoBubbles(ctx, w, h, t, duration) {
    const random = rng(727);
    const phase = (t / duration) % 1;
    glow(ctx, w * 0.62, h * 0.1, w * 0.38, "rgba(140,235,255,0.45)", 0.15);
    for (let i = 0; i < 44; i += 1) {
      const x = random() * w;
      const base = random() * h;
      const y = h - ((base + phase * h * (0.6 + random() * 0.5)) % (h + 30));
      const r = Math.max(0.7, w * (0.0012 + random() * 0.004));
      ctx.strokeStyle = `rgba(195,245,255,${0.08 + random() * 0.22})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i += 1) {
      glow(ctx, random() * w, h * (0.15 + random() * 0.7), w * (0.002 + random() * 0.008), "rgba(160,230,255,0.6)", 0.35);
    }
  }

  function photoAurora(ctx, w, h, t, duration) {
    const phase = (t / duration) % 1;
    for (let i = 0; i < 4; i += 1) {
      const x = w * (0.2 + i * 0.22) + Math.sin(TAU * phase + i) * w * 0.06;
      glow(ctx, x, h * (0.25 + (i % 2) * 0.1), w * 0.32, i % 2 ? "rgba(160,110,255,0.5)" : "rgba(70,255,160,0.45)", 0.16);
    }
    starField(ctx, w, h, 911, 70, t, duration, { band: 0.55, maxRadius: 0.8 });
  }

  function photoForest(ctx, w, h, t, duration) {
    const random = rng(737);
    const phase = (t / duration) % 1;
    glow(ctx, w * 0.3, h * 0.18, w * 0.35, "rgba(255,240,185,0.5)", 0.18);
    for (let i = 0; i < 90; i += 1) {
      const x = w * (0.1 + random() * 0.8) + Math.sin(TAU * phase + i) * w * 0.006;
      const y = h * (0.15 + random() * 0.75) - phase * h * 0.03;
      const r = Math.max(0.5, w * (0.0005 + random() * 0.0015));
      ctx.fillStyle = `rgba(255,245,200,${0.2 + random() * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  function photoBokeh(ctx, w, h, t, duration, colors) {
    const random = rng(747);
    const phase = (t / duration) % 1;
    for (let i = 0; i < 22; i += 1) {
      const x = (random() * w + Math.sin(TAU * phase + i) * w * 0.01) % w;
      const y = h * (0.1 + random() * 0.75);
      const r = w * (0.004 + random() * 0.016);
      glow(ctx, x, y, r * 4, colors[i % colors.length], 0.22 + 0.18 * Math.abs(Math.sin(TAU * phase + i)));
    }
  }

  function drawPhotoFrame(ctx, w, h, t, duration, spec) {
    drawPhotoBase(ctx, w, h, t, duration, spec);
    const random = rng(spec.seed ?? 808);
    switch (spec.effect) {
      case "sakura":
        for (let i = 0; i < 4; i += 1) {
          const x = w * (0.12 + random() * 0.76);
          const y = h * (0.2 + random() * 0.5);
          glow(ctx, x, y, w * (0.05 + random() * 0.08), "rgba(255,205,140,0.5)", 0.35);
        }
        photoPetals(ctx, w, h, t, duration, 70, ["#ffd1e3", "#ffb3d2", "#fff0f6"]);
        break;
      case "neon":
        photoRain(ctx, w, h, t, duration);
        break;
      case "stars":
        photoStars(ctx, w, h, t, duration);
        break;
      case "ocean":
        photoBubbles(ctx, w, h, t, duration);
        break;
      case "aurora":
        photoAurora(ctx, w, h, t, duration);
        break;
      case "forest":
        photoForest(ctx, w, h, t, duration);
        break;
      case "leaves":
        photoPetals(ctx, w, h, t, duration, 26, ["#ffc27a", "#e9995b", "#f8d7a0"]);
        glow(ctx, w * 0.65, h * 0.18, w * 0.34, "rgba(255,220,160,0.5)", 0.16);
        break;
      case "flowers":
        photoPetals(ctx, w, h, t, duration, 48, ["#ffd7dc", "#ffb3c1", "#fff0d0"]);
        photoBokeh(ctx, w, h, t, duration, ["rgba(255,220,180,0.6)", "rgba(255,170,200,0.5)"]);
        break;
      default:
        break;
    }
    addGrain(ctx, w, h, 0.035);
    addVignette(ctx, w, h, 0.26);
  }

  async function renderPhotoPoster(spec) {
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    drawPhotoFrame(ctx, spec.width, spec.height, spec.posterTime ?? 2.4, spec.duration ?? 5, spec);
    return canvas.toDataURL("image/jpeg", 0.94).split(",")[1];
  }

  async function renderPhotoVideo(spec) {
    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(spec.fps ?? 30);
    const mime = "video/mp4;codecs=avc1.42E01E";
    if (!MediaRecorder.isTypeSupported(mime)) throw new Error("MP4/H.264 recording is unavailable");
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: spec.bitrate ?? 7_000_000,
    });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    });
    recorder.start(1000);
    const duration = spec.duration ?? 5;
    const start = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        const elapsed = (performance.now() - start) / 1000;
        const t = Math.min(elapsed, duration);
        drawPhotoFrame(ctx, spec.width, spec.height, t, duration, spec);
        if (elapsed < duration) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: "video/mp4" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return { base64: btoa(binary), bytes: bytes.length, mime: blob.type, durationSeconds: duration };
  }

  window.WHMedia = { renderStill, renderPoster, renderVideo, scenes: Object.keys(SCENES) };
  window.WHPhoto = { setFrame, renderPhotoPoster, renderPhotoVideo };
})();
