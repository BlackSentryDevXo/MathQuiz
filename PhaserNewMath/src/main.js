import BootScene from "./scenes/BootScene.js";
import GameScene from "./scenes/GameScene.js";
import { BASE_WIDTH, BASE_HEIGHT } from "./config.js";

// Phaser is loaded globally via <script> tag, but we can still use modules for our code.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0b0b",
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  scene: [BootScene, GameScene],
  physics: { default: "arcade" },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: "game" },
  dom: { createContainer: true } // ✅ enable DOM elements for <input>
});

// Optional: hot reload-friendly hook
window.__GAME__ = game;