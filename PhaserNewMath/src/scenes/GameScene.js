import { gameOptions, BASE_WIDTH, BASE_HEIGHT } from "../config.js";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("Game");
  }

  init() {
    this.gamePhase = "idle"; // "idle" | "countdown" | "play" | "gameover"
    this.isGameOver = false;
    this.score = 0;
    this.correctAnswers = 0;
    this.topScore = parseInt(localStorage.getItem(gameOptions.localStorageName) || "0", 10);
    this.sumsArray = [];

    for (let i = 1; i < gameOptions.maxSumLen; i++) {
      this.sumsArray[i] = [[], [], []];
      for (let j = 1; j <= 3; j++) this.buildThrees(j, 1, i, `${j}`);
    }

    this.floatPool = null;
    this._timerWidth = 0;

    this.colors = {
      textMain: "#eaf7ff",
      textSoft: "#9fd2ff",
      points: "#39ffb0",
      retry: "#c2ccd9",
      btnGlowTint: 0x7afcff,
      btnDownTint: 0xff2bd6
    };
  }

  create() {
    this.cameras.main.setBackgroundColor("#0f1621");
    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x0f1621).setOrigin(0).setDepth(-10);
    this.add.image(0, 0, "vignette").setOrigin(0).setAlpha(0.45).setDepth(50);

    this.scoreText = this.add.text(40, 40, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: "36px",
      fontStyle: "bold",
      color: this.colors.textSoft
    }).setDepth(10);

    this.questionText = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT * 0.28, "-", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: "96px",
      fontStyle: "900",
      color: this.colors.textMain,
      stroke: "#14e6ff",
      strokeThickness: 2
    }).setOrigin(0.5).setDepth(10);

    // Timer
    this.timerBg = this.add.image(BASE_WIDTH / 2, BASE_HEIGHT * 0.36, "bar-bg").setOrigin(0.5);
    this.timerFill = this.add.image(this.timerBg.x - this.timerBg.width / 2, this.timerBg.y, "bar-fill").setOrigin(0, 0.5);
    this.timerBg.y = BASE_HEIGHT * 0.375;
    this.timerFill.y = this.timerBg.y;

    // Buttons (zones for reliable input)
    this.buttons = [];
    const labels = ["1", "2", "3"];
    for (let i = 0; i < 3; i++) {
      const y = BASE_HEIGHT * 0.52 + i * 150;
      const btn = this.add.container(BASE_WIDTH / 2, y).setDepth(5);

      const bg = this.add.image(0, 0, "btn-normal");
      btn.setSize(bg.width, bg.height);

      const txt = this.add.text(0, 0, labels[i], {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "64px",
        fontStyle: "bold",
        color: this.colors.textMain
      }).setOrigin(0.5);

      const hit = this.add.zone(0, 0, 640, 120).setOrigin(0.5).setInteractive({ useHandCursor: true });

      let hoverTween = null;
      hit.on("pointerover", () => {
        if (this.gamePhase !== "play") return;
        bg.setTexture("btn-hover").setTint(this.colors.btnGlowTint);
        hoverTween = this.tweens.add({ targets: btn, scale: 1.02, duration: 140, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      });
      hit.on("pointerout", () => {
        bg.setTexture("btn-normal").clearTint();
        hoverTween?.stop(); hoverTween = null;
        btn.setScale(1);
      });
      hit.on("pointerdown", () => {
        if (this.gamePhase !== "play") return;
        bg.setTexture("btn-down").setTint(this.colors.btnDownTint);
        this.tweens.add({ targets: btn, scale: 0.97, duration: 80, yoyo: true, ease: "Quad.easeOut" });
        this._haptic(15);
      });
      hit.on("pointerup", () => {
        if (this.gamePhase !== "play") return;
        bg.setTexture("btn-hover").setTint(this.colors.btnGlowTint);
        this.checkAnswer(i);
      });

      btn.add([bg, txt, hit]);
      btn.bg = bg; btn.txt = txt; btn.index = i; btn.hit = hit;
      this.buttons.push(btn);
    }
    this.setButtonsInteractive(false); // disabled until game starts

    // Particles
    this.emitter = this.add.particles(0, 0, "dot", {
      speed: { min: 140, max: 260 },
      angle: { min: -85, max: -95 },
      gravityY: 500,
      lifespan: 600,
      scale: { start: 0.9, end: 0.1 },
      quantity: 12,
      emitting: false
    });

    // Pooled floating +score texts
    this.floatPool = this.add.group({ classType: Phaser.GameObjects.Text, maxSize: 12, runChildUpdate: false });

    // Initial "tap to start"
    this._showTapToStart();

    // Responsive
    this.scale.on("resize", this.onResize, this);
    this.onResize({ width: this.scale.width, height: this.scale.height });
  }

  // ----- Question generator -----
  buildThrees(initialNumber, currentIndex, limit, currentString) {
    const numbersArray = [-3, -2, -1, 1, 2, 3];
    for (let i = 0; i < numbersArray.length; i++) {
      const delta = numbersArray[i];
      const sum = initialNumber + delta;
      const outputString = currentString + (delta < 0 ? "" : "+") + delta;
      if (sum > 0 && sum < 4 && currentIndex === limit) this.sumsArray[limit][sum - 1].push(outputString);
      if (currentIndex < limit) this.buildThrees(sum, currentIndex + 1, limit, outputString);
    }
  }

  // ----- Game loop bits -----
  nextNumber() {
    this.gamePhase = "play";
    this.setButtonsInteractive(true);
    this.updateScoreText();

    if (this.timeTween) this.timeTween.stop();
    const fullW = this.timerBg.width;
    this._timerWidth = fullW;
    this.timerFill.setCrop(0, 0, fullW, this.timerBg.height);

    const questionLength = Math.min(Math.floor(this.score / gameOptions.nextLevel) + 1, 4);
    this.randomSum = Phaser.Math.Between(0, 2);
    const bucket = this.sumsArray[questionLength][this.randomSum];
    const qText = bucket[Phaser.Math.Between(0, bucket.length - 1)];
    this.questionText.setText(qText);

    this.tweens.add({ targets: this.questionText, scale: 1.06, duration: 130, yoyo: true, ease: "Sine.easeOut" });

    this.timeTween = this.tweens.addCounter({
      from: fullW,
      to: 0,
      duration: gameOptions.timeToAnswer,
      ease: "Linear",
      onUpdate: (tw) => {
        const w = tw.getValue();
        this._timerWidth = w;
        this.timerFill.setCrop(0, 0, w, this.timerBg.height);
      },
      onComplete: () => {
        if (this.gamePhase === "play") this.gameOver("?");
      }
    });
  }

  checkAnswer(buttonIndex) {
    if (this.gamePhase !== "play") return;

    if (buttonIndex === this.randomSum) {
      const points = Math.max(1, Math.floor(this._timerWidth / 4));
      this.score += points;
      this.correctAnswers++;

      const btn = this.buttons[buttonIndex];
      this.emitter.explode(18, btn.x, btn.y - 20);

      const floating = this._getFloatText(btn.x, btn.y - 70, `+${points}`);
      this.tweens.add({
        targets: floating, y: floating.y - 60, alpha: 0, duration: 550, ease: "Cubic.easeOut",
        onComplete: () => this._recycleFloatText(floating)
      });

      this.cameras.main.shake(60, 0.002);
      this._haptic(25);

      this.nextNumber();
    } else {
      if (this.timeTween) this.timeTween.stop();
      this.gameOver((buttonIndex + 1).toString());
    }
  }

  gameOver(str) {
    this.gamePhase = "gameover";
    this.isGameOver = true;
    this.setButtonsInteractive(false);

    // Dim buttons
    this.buttons.forEach(b => { b.bg.setTexture("btn-normal").clearTint().setAlpha(0.6); b.txt.setAlpha(0.6); });

    // Reveal result + juice
    this.questionText.setText(this.questionText.text + " = " + str);
    this.cameras.main.flash(100, 255, 30, 30);
    this.cameras.main.shake(220, 0.01);
    this._haptic(35);

    const newTop = Math.max(this.score, this.topScore);
    localStorage.setItem(gameOptions.localStorageName, newTop.toString());
    this.topScore = newTop;

    // Tap to start (again)
    this._showTapToStart();
  }

  // ----- Start / Retry UX -----
  _showTapToStart() {
    this.gamePhase = "idle";
    this.setButtonsInteractive(false);

    // Prompt
    const prompt = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT * 0.88, "Tap to start", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: "38px",
      color: this.colors.retry
    }).setOrigin(0.5).setAlpha(0).setDepth(200);

    this.tweens.add({ targets: prompt, alpha: 1, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });

    // Full-screen blocker to capture the tap
    const blocker = this.add.zone(0, 0, BASE_WIDTH, BASE_HEIGHT)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .setDepth(190);

    blocker.once("pointerdown", () => {
      // Clear prompt and run Ready->Go
      prompt.destroy();
      this._beginReadyGo(blocker);
    });
  }

  _beginReadyGo(blocker) {
    this.gamePhase = "countdown";
    blocker.disableInteractive(); // prevent stray taps during Ready/Go

    // Dim overlay
    const dim = this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x000000, 0.55).setOrigin(0).setDepth(210);

    const bigText = this.add.text(BASE_WIDTH / 2, BASE_HEIGHT * 0.45, "Ready?", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: "120px",
      fontStyle: "900",
      color: this.colors.textMain,
      stroke: "#ff2bd6",
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(220).setScale(0.9).setAlpha(0);

    // Show "Ready?"
    this.tweens.add({
      targets: bigText,
      alpha: 1,
      scale: 1.05,
      duration: 240,
      ease: "Back.Out",
      onStart: () => this._haptic(20),
      onComplete: () => {
        // Fade out Ready, then show "Go!"
        this.tweens.add({
          targets: bigText,
          alpha: 0,
          duration: 220,
          delay: 450,
          ease: "Sine.InOut",
          onComplete: () => {
            bigText.setText("Go!").setAlpha(0).setScale(0.7);
            this.tweens.add({
              targets: bigText,
              alpha: 1,
              scale: 1.15,
              duration: 180,
              ease: "Back.Out",
              onStart: () => this._haptic(25),
              onComplete: () => {
                this.tweens.add({
                  targets: bigText,
                  alpha: 0,
                  duration: 180,
                  delay: 250,
                  ease: "Sine.InOut",
                  onComplete: () => {
                    dim.destroy(); bigText.destroy();
                    // Start a fresh round (reset state like a restart)
                    this._startNewRun();
                  }
                });
              }
            });
          }
        });
      }
    });
  }

  _startNewRun() {
    // Reset critical round state
    this.isGameOver = false;
    this.score = 0;
    this.correctAnswers = 0;

    // Restore button visuals
    this.buttons.forEach(b => { b.bg.setAlpha(1); b.txt.setAlpha(1); });

    // Start gameplay
    this.nextNumber();
  }

  // ----- UI helpers -----
  updateScoreText() {
    this.scoreText.setText(`Score: ${this.score}\nBest: ${this.topScore}`);
  }

  onResize({ width, height }) {
    const cam = this.cameras.main;
    const scaleX = width / BASE_WIDTH;
    const scaleY = height / BASE_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    cam.setZoom(scale);
    const offsetX = (width - BASE_WIDTH * scale) * 0.5 / scale;
    const offsetY = (height - BASE_HEIGHT * scale) * 0.5 / scale;
    cam.setScroll(-offsetX, -offsetY);
  }

  setButtonsInteractive(enabled) {
    this.buttons?.forEach(b => {
      if (!b?.hit) return;
      if (enabled) b.hit.setInteractive({ useHandCursor: true });
      else b.hit.disableInteractive();
    });
  }

  _getFloatText(x, y, text) {
    let t = this.floatPool.getFirstDead();
    if (!t) {
      t = this.add.text(x, y, text, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "42px",
        fontStyle: "bold",
        color: this.colors.points
      }).setOrigin(0.5).setDepth(20);
      this.floatPool.add(t);
    } else {
      t.setText(text).setPosition(x, y).setStyle({ color: this.colors.points });
      t.setAlpha(1); t.active = true; t.visible = true;
    }
    return t;
  }

  _recycleFloatText(t) {
    t.active = false; t.visible = false;
  }

  _haptic(ms = 20) {
    if (navigator?.vibrate) navigator.vibrate(ms);
  }
}