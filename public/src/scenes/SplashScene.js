import { BASE_WIDTH, BASE_HEIGHT } from "../config.js";

export default class SplashScene extends Phaser.Scene {
  constructor() { super("Splash"); }

  preload() {
    // If you set a global logo URL, load it as "logo"
    const logoURL = window.SPLASH_LOGO_URL;
    if (logoURL && !this.textures.exists("logo")) {
      this.load.image("logo", logoURL);
    }
  }

  create() {
    // Background: white, black, or custom (CSS color or hex) via global
    const bg = window.SPLASH_BG || "#000000";
    this.cameras.main.setBackgroundColor(bg);
    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0) // keep scene-sized input safe
      .setOrigin(0).setDepth(-10);

    // Centered logo (or text fallback)
    let logo;
    if (this.textures.exists("logo")) {
      logo = this.add.image(BASE_WIDTH / 2, BASE_HEIGHT / 2, "logo")
        .setAlpha(0)
        .setOrigin(0.5)
        .setDepth(10);

      // Fit logo nicely without stretching
      const maxW = BASE_WIDTH * 0.5;
      const maxH = BASE_HEIGHT * 0.35;
      const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
      logo.setScale(scale);
    } else {
      logo = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT / 2, "Your Logo", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "48px",
        fontStyle: "bold",
        color: bg === "#000000" ? "#ffffff" : "#111111"
      }).setOrigin(0.5).setDepth(10).setAlpha(0);
    }

    // Fade in → hold → fade out, then start Game
    const fadeIn = 420, hold = 700, fadeOut = 260;

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
}