import { prefersReducedMotion } from './hooks.ts';

const PARTICLE_COUNT = 90;
const DURATION_MS = 1500;
const COLOR_TOKENS = ['--accent', '--highlight', '--sakura', '--success'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  spin: number;
}

/**
 * A short burst of confetti. It does nothing when the user prefers reduced motion.
 * The canvas joins the browser's top layer (popover) so it shows above open dialogs.
 */
export function launchConfetti(): void {
  if (prefersReducedMotion()) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.setAttribute('popover', 'manual');
  document.body.appendChild(canvas);
  canvas.showPopover?.();

  const context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }

  const style = getComputedStyle(document.documentElement);
  const colors = COLOR_TOKENS.map((token) => style.getPropertyValue(token).trim()).filter((color) => color !== '');
  const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
    x: canvas.width / 2,
    y: canvas.height * 0.7,
    vx: (Math.random() - 0.5) * 16,
    vy: -8 - Math.random() * 12,
    size: 6 + Math.random() * 6,
    color: colors[index % colors.length] ?? '#3a46ff',
    spin: Math.random() * Math.PI,
  }));

  const startedAt = performance.now();
  const frame = (now: number) => {
    const elapsed = now - startedAt;
    if (elapsed > DURATION_MS) {
      canvas.remove();
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = Math.min(1, (DURATION_MS - elapsed) / 400);
    for (const particle of particles) {
      particle.vy += 0.45;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.spin += 0.2;
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.spin);
      context.fillStyle = particle.color;
      context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      context.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
