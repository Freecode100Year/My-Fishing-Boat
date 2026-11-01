export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();

  mouseX = window.innerWidth * 0.5;
  mouseY = window.innerHeight * 0.5;
  mouseNX = 0;
  mouseNY = 0;
  leftDown = false;
  rightDown = false;
  dragX = 0;
  dragY = 0;
  wheelDelta = 0;
  active = true;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bind();
  }

  private bind(): void {
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLSelectElement) {
        return;
      }
      if (['Tab', 'Space', 'KeyE', 'KeyR', 'KeyU', 'KeyF', 'KeyG', 'KeyM', 'KeyH'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.leftDown = false;
      this.rightDown = false;
    });

    window.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this.mouseX;
      const dy = e.clientY - this.mouseY;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNY = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.rightDown) {
        this.dragX += dx;
        this.dragY += dy;
      }
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.leftDown = true;
      if (e.button === 2) {
        this.rightDown = true;
        this.canvas.setPointerCapture?.(e.pointerId);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.leftDown = false;
      if (e.button === 2) this.rightDown = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheelDelta += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Keep the turret crosshair centered until the player moves the pointer. */
  centerPointer(): void {
    this.mouseX = window.innerWidth * 0.5;
    this.mouseY = window.innerHeight * 0.5;
    this.mouseNX = 0;
    this.mouseNY = 0;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  justPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  axis(neg: string, pos: string): number {
    return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0);
  }

  get fireHeld(): boolean {
    return this.leftDown || this.keys.has('Space');
  }

  get throttle(): number {
    return this.axis('KeyS', 'KeyW');
  }

  get rudder(): number {
    return this.axis('KeyD', 'KeyA');
  }

  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.dragX = 0;
    this.dragY = 0;
    this.wheelDelta = 0;
  }
}
