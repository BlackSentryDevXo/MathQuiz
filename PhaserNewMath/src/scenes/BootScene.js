import { BASE_WIDTH, BASE_HEIGHT } from "../config.js";

export default class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload() {
    // Configurable splash background + logo
    this._bgColor = window.SPLASH_BG || "#000000";
    let url = window.SPLASH_LOGO_URL;
    if (url) {
        url = String(url).replace(/\/+$/,''); // strip trailing slashes
        if (!this.textures.exists("logo")) {
        this.load.image("logo", url);
        // nice diagnostics if it fails
        this.load.on('loaderror', (file) => {
            if (file && file.key === 'logo') {
            console.warn('[Splash] Failed to load logo from', url);
            }
        });
        }
    }

    // If you already have actual assets, you can load them here:
    // this.load.image("vignette", "assets/vignette.png");
    // this.load.image("bar-bg", "assets/bar-bg.png");
    // this.load.image("bar-fill", "assets/bar-fill.png");
    // this.load.image("btn-normal", "assets/btn-normal.png");
    // this.load.image("btn-hover",  "assets/btn-hover.png");
    // this.load.image("btn-down",   "assets/btn-down.png");
    // this.load.image("dot",        "assets/dot.png");
  }

  create() {
    // Scene BG
    this.cameras.main.setBackgroundColor(this._bgColor);

    // Ensure required textures exist (generate pretty fallbacks if missing)
    this._ensureRuntimeTextures();

    // Centered logo or fallback text
    let logo;
    if (this.textures.exists("logo")) {
      logo = this.add.image(BASE_WIDTH / 2, BASE_HEIGHT / 2, "logo").setOrigin(0.5).setAlpha(0);
      const maxW = BASE_WIDTH * 0.5;
      const maxH = BASE_HEIGHT * 0.35;
      const s = Math.min(maxW / logo.width, maxH / logo.height, 1);
      logo.setScale(s);
    } else {
      const textColor = (this._bgColor || "").toLowerCase() === "#000000" ? "#ffffff" : "#111111";
      logo = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2, "Your Logo", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "48px",
        fontStyle: "bold",
        color: textColor
      }).setOrigin(0.5).setAlpha(0);
    }

    // Fade in → hold → fade out, then start Game
    const fadeIn = 420, hold = 700, fadeOut = 420;
    this.tweens.add({
      targets: logo,
      alpha: 1,
      duration: fadeIn,
      ease: "Sine.Out",
      onComplete: () => {
        this.time.delayedCall(hold, () => {
          this.tweens.add({
            targets: logo,
            alpha: 0,
            duration: fadeOut,
            ease: "Sine.In",
            onComplete: () => this.scene.start("Game")
          });
        });
      }
    });
  }

  // ----- Helpers -----
  _ensureRuntimeTextures() {
    // Vignette fallback (soft corners)
    if (!this.textures.exists("vignette")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.0001); g.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT); // base
      // draw dark corners
      const rad = Math.max(BASE_WIDTH, BASE_HEIGHT) * 0.6;
      g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.42);
      g.fillCircle(0, 0, rad);
      g.fillCircle(BASE_WIDTH, 0, rad);
      g.fillCircle(0, BASE_HEIGHT, rad);
      g.fillCircle(BASE_WIDTH, BASE_HEIGHT, rad);
      g.generateTexture("vignette", BASE_WIDTH, BASE_HEIGHT);
      g.destroy();
    }

    // Timer bar bg/fill
    if (!this.textures.exists("bar-bg")) {
      const w = 540, h = 18;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x0a1a2a, 1).fillRoundedRect(0, 0, w, h, 9);
      g.lineStyle(2, 0x14e6ff, 0.35).strokeRoundedRect(0, 0, w, h, 9);
      g.generateTexture("bar-bg", w, h); g.destroy();
    }
    if (!this.textures.exists("bar-fill")) {
      const w = 540, h = 18;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x14e6ff, 1).fillRoundedRect(0, 0, w, h, 9);
      g.generateTexture("bar-fill", w, h); g.destroy();
    }

    // Buttons
    const makeBtn = (key, fill, stroke) => {
      const w = 640, h = 120, r = 22;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(fill, 1).fillRoundedRect(0, 0, w, h, r);
      g.lineStyle(3, stroke, 0.5).strokeRoundedRect(0, 0, w, h, r);
      g.generateTexture(key, w, h); g.destroy();
    };
    if (!this.textures.exists("btn-normal")) makeBtn("btn-normal", 0x0f2235, 0x14e6ff);
    if (!this.textures.exists("btn-hover"))  makeBtn("btn-hover",  0x12304a, 0x7afcff);
    if (!this.textures.exists("btn-down"))   makeBtn("btn-down",   0x1a2540, 0xff2bd6);

    // Confetti dot
    if (!this.textures.exists("dot")) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillCircle(6, 6, 6);
      g.generateTexture("dot", 12, 12); g.destroy();
    }
  }
}