import { BASE_WIDTH, BASE_HEIGHT } from "../config.js";

export default class BootScene extends Phaser.Scene {
  constructor(){ super("Boot"); }

  preload(){
    // ===== Runtime textures (no external assets) =====
    const makeRounded = (key, w, h, fill, stroke, strokeAlpha=0.25) => {
      const g = this.make.graphics({ x:0, y:0, add:false });
      g.fillStyle(fill, 1);
      g.lineStyle(4, stroke, strokeAlpha);
      g.fillRoundedRect(0,0,w,h,20);
      g.strokeRoundedRect(0,0,w,h,20);
      g.generateTexture(key, w, h);
      g.destroy();
    };
makeRounded("btn-normal", 640, 120, 0x121826, 0x14e6ff, 0.10); // subtle cyan edge
makeRounded("btn-hover",  640, 120, 0x162033, 0x7afcff, 0.20); // brighter cyan
makeRounded("btn-down",   640, 120, 0x0c1320, 0xff2bd6, 0.30); // magenta edge

    const makeBar = (key, w, h, color) => {
      const g = this.make.graphics({ x:0, y:0, add:false });
      g.fillStyle(color, 1);
      g.fillRoundedRect(0,0,w,h,12);
      g.generateTexture(key, w, h);
      g.destroy();
    };
// Timer bar: darker bg + neon fill
makeBar("bar-bg",   700, 28, 0x0f1a29);
makeBar("bar-fill", 700, 28, 0x39ffb0); // neon mint

    // Tiny particle dot
    {
      const g = this.make.graphics({ x:0, y:0, add:false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6,6,6);
      g.generateTexture("dot", 12, 12);
      g.destroy();
    }

    // Vignette
    const w = BASE_WIDTH, h = BASE_HEIGHT;
    const rt = this.make.renderTexture({ width:w, height:h, add:false });
    const g = this.make.graphics({ x:0, y:0, add:false });
    const steps = 8;
    for (let i=0;i<steps;i++){
      const alpha = 0.06 + (i/steps)*0.18;
      g.fillStyle(0x000000, alpha);
      g.fillRoundedRect(10+i*6,10+i*6,w-20-i*12,h-20-i*12,30);
    }
    rt.draw(g); rt.saveTexture("vignette"); rt.destroy(); g.destroy();
  }

  create(){
    this.scene.start("Game");
  }
}