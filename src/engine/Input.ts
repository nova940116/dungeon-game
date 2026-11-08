import type { Vec2 } from '../utils/math';

const MOVE_KEYS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
} as const;

/**
 * Keyboard + floating virtual joystick (touch or mouse drag).
 * Exposes a single normalized move vector on the floor plane.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly joystick = { active: false, pointerId: -1, originX: 0, originY: 0, x: 0, y: 0 };
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(
    private readonly surface: HTMLElement,
    private readonly joystickRadius = 50,
  ) {
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick__knob';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.reset);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Movement direction on the floor (x: right, z: toward the camera). Length ≤ 1. */
  get moveVector(): Vec2 {
    const pressed = (codes: readonly string[]) => codes.some((c) => this.keys.has(c));
    let x = (pressed(MOVE_KEYS.right) ? 1 : 0) - (pressed(MOVE_KEYS.left) ? 1 : 0);
    let z = (pressed(MOVE_KEYS.down) ? 1 : 0) - (pressed(MOVE_KEYS.up) ? 1 : 0);
    if (this.joystick.active) {
      x += this.joystick.x;
      z += this.joystick.y;
    }
    const len = Math.hypot(x, z);
    return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }

  reset = (): void => {
    this.keys.clear();
    this.releaseJoystick();
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.reset);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerUp);
    this.base.remove();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    const j = this.joystick;
    Object.assign(j, { active: true, pointerId: e.pointerId, originX: e.clientX, originY: e.clientY, x: 0, y: 0 });
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.base.classList.add('is-active');
    this.knob.style.transform = 'translate(0px, 0px)';
    this.surface.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const j = this.joystick;
    if (!j.active || e.pointerId !== j.pointerId) return;
    let dx = e.clientX - j.originX;
    let dy = e.clientY - j.originY;
    const len = Math.hypot(dx, dy);
    const max = this.joystickRadius;
    if (len > max) {
      dx *= max / len;
      dy *= max / len;
    }
    j.x = dx / max;
    j.y = dy / max;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.joystick.pointerId) this.releaseJoystick();
  };

  private releaseJoystick(): void {
    Object.assign(this.joystick, { active: false, pointerId: -1, x: 0, y: 0 });
    this.base.classList.remove('is-active');
  }
}
