import { gameOptions, BASE_WIDTH, BASE_HEIGHT } from "../config.js";
import { ready, saveBestScore, getMyRank }  from "../services/firebase.js";
import LeaderboardOverlay from "../ui/LeaderboardOverlay.js";

export default class GameScene extends Phaser.Scene {
  constructor(){ super("Game"); }

  init(){
    this.gamePhase = "idle";
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
    this.gamerTag = localStorage.getItem("gamerTag") || null;

    this.colors = {
      textMain: "#eaf7ff",
      textSoft: "#9fd2ff",
      points: "#39ffb0",
      retry: "#c2ccd9",
      btnGlowTint: 0x7afcff,
      btnDownTint: 0xff2bd6,
      neonBar: 0x14e6ff,
      neonAccent: 0x7afcff
    };
  }

  create(){
    // Background + subtle color pops
    this.cameras.main.setBackgroundColor("#0b1320");
    this.add.rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x0b1320).setOrigin(0).setDepth(-10);
    this.add.image(0, 0, "vignette").setOrigin(0).setAlpha(0.35).setDepth(50);

    // faint diagonal scanline
    const scan = this.add.graphics().setDepth(-5);
    scan.fillStyle(0x123a63, 0.18);
    for (let x = -BASE_HEIGHT; x < BASE_WIDTH; x += 32) {
      scan.fillRect(x, 0, 2, BASE_HEIGHT);
    }

    // UI
    this.scoreText = this.add.text(40, 40, "", {
      fontFamily:"system-ui, -apple-system, Segoe UI, Roboto",
      fontSize:"36px", fontStyle:"bold", color:this.colors.textSoft
    }).setDepth(10);

    // Top-right "Rank"
    this.rankText = this.add.text(BASE_WIDTH - 40, 40, "Rank: —", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      fontSize: "28px",
      fontStyle: "bold",
      color: "#eaf7ff"
    }).setOrigin(1, 0).setDepth(10);
    this.rankText.setInteractive({ useHandCursor: true }).on("pointerup", () => this.lbOverlay?.show());

    this.questionText = this.add.text(BASE_WIDTH/2, BASE_HEIGHT*0.28, "-", {
      fontFamily:"system-ui, -apple-system, Segoe UI, Roboto",
      fontSize:"96px", fontStyle:"900", color:this.colors.textMain, stroke:"#14e6ff", strokeThickness:3
    }).setOrigin(0.5).setDepth(10);

    // Timer (brighter bar)
    this.timerBg = this.add.image(BASE_WIDTH/2, BASE_HEIGHT*0.375, "bar-bg").setOrigin(0.5);
    this.timerFill = this.add.image(this.timerBg.x - this.timerBg.width/2, this.timerBg.y, "bar-fill")
      .setOrigin(0,0.5)
      .setTint(this.colors.neonBar);

    // Buttons (zones)
    this.buttons = [];
    const labels = ["1","2","3"];

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

    // keep references
    btn.bg = bg; btn.txt = txt; btn.index = i; btn.hit = hit; btn.hoverTween = null;

    hit.on("pointerover", () => {
        if (this.gamePhase !== "play") return;
        bg.setTexture("btn-hover").setTint(this.colors.btnGlowTint);
        this._startHover(btn);
    });

    hit.on("pointerout", () => {
        bg.setTexture("btn-normal").clearTint();
        this._stopHover(btn);
    });

    hit.on("pointerdown", () => {
        if (this.gamePhase !== "play") return;
        bg.setTexture("btn-down").setTint(this.colors.btnDownTint);
        this._stopHover(btn); // ensure pulse stops while pressing
        this.tweens.add({ targets: btn, scale: 0.97, duration: 80, yoyo: true, ease: "Quad.easeOut" });
        this._haptic(15);
    });

    hit.on("pointerup", () => {
        if (this.gamePhase !== "play") return;
        bg.setTexture("btn-hover").setTint(this.colors.btnGlowTint);
        this._stopHover(btn); // kill any lingering hover
        this.checkAnswer(i);
    });

    btn.add([bg, txt, hit]);
    this.buttons.push(btn);
    }
    this.setButtonsInteractive(false);

    // Particles
    this.emitter = this.add.particles(0,0,"dot",{
      speed:{min:140,max:260}, angle:{min:-85,max:-95}, gravityY:500, lifespan:600,
      scale:{start:0.9,end:0.1}, quantity:12, emitting:false
    });

    // Float pool
    this.floatPool = this.add.group({ classType: Phaser.GameObjects.Text, maxSize: 12, runChildUpdate:false });

    // Leaderboard overlay + COMPACT neon button (bottom-left)
    this.lbOverlay = new LeaderboardOverlay(this);
    {
      const label = "🏆 Leaderboard";
      const btn = this.add.container(24, BASE_HEIGHT - 24).setDepth(300);

      const baseScale = 0.6;
      const maxWidth = 220;

      const bg = this.add.image(0, 0, "btn-normal").setOrigin(0, 1).setScale(baseScale);
      const txt = this.add.text(20, -bg.displayHeight / 2, label, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "24px",
        fontStyle: "bold",
        color: "#eaf7ff"
      }).setOrigin(0, 0.5);

      const needed = txt.width + 40;
      const targetW = Math.min(maxWidth, Math.max(needed, bg.displayWidth));
      bg.setScale(targetW / bg.width, baseScale);

      const hit = this.add.zone(0, -bg.displayHeight, bg.displayWidth, bg.displayHeight)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      hit.on("pointerover", () => bg.setTexture("btn-hover").setTint(this.colors.btnGlowTint));
      hit.on("pointerout",  () => bg.setTexture("btn-normal").clearTint());
      hit.on("pointerdown", () => {
        bg.setTexture("btn-down").setTint(this.colors.btnDownTint);
        this.tweens.add({ targets: btn, scale: 0.98, duration: 80, yoyo: true });
      });
      hit.on("pointerup",   () => this.lbOverlay.show());

      btn.add([bg, txt, hit]);
      this.scale.on("resize", () => { btn.y = BASE_HEIGHT - 24; });
    }

    // Start loop immediately (Splash handles logo)
    this._showTapToStart();

    // Responsive
    this.scale.on("resize", this.onResize, this);
    this.onResize({ width:this.scale.width, height:this.scale.height });
  }

  // ------- Core generator -------
  buildThrees(initialNumber, currentIndex, limit, currentString){
    const numbersArray = [-3,-2,-1,1,2,3];
    for(let i=0;i<numbersArray.length;i++){
      const delta=numbersArray[i]; const sum=initialNumber+delta;
      const output=currentString + (delta<0?"":"+") + delta;
      if(sum>0 && sum<4 && currentIndex===limit) this.sumsArray[limit][sum-1].push(output);
      if(currentIndex<limit) this.buildThrees(sum, currentIndex+1, limit, output);
    }
  }

  nextNumber(){
    this.gamePhase = "play";
    this.setButtonsInteractive(true);
    this.updateScoreText();

    if(this.timeTween) this.timeTween.stop();
    const fullW = this.timerBg.width;
    this._timerWidth = fullW;
    this.timerFill.setCrop(0,0,fullW,this.timerBg.height);

    const questionLength = Math.min(Math.floor(this.score / gameOptions.nextLevel)+1, 4);
    this.randomSum = Phaser.Math.Between(0,2);
    const bucket = this.sumsArray[questionLength][this.randomSum];
    const qText = bucket[Phaser.Math.Between(0, bucket.length-1)];
    this.questionText.setText(qText);

    this.tweens.add({ targets:this.questionText, scale:1.06, duration:130, yoyo:true, ease:"Sine.easeOut" });

    this.timeTween = this.tweens.addCounter({
      from: fullW, to: 0, duration: gameOptions.timeToAnswer, ease: "Linear",
      onUpdate: (tw)=>{ const w=tw.getValue(); this._timerWidth=w; this.timerFill.setCrop(0,0,w,this.timerBg.height); },
      onComplete: ()=>{ if(this.gamePhase==="play") this.gameOver("?"); }
    });
  }

  checkAnswer(buttonIndex){
    if (this.gamePhase!=="play") return;
    if (buttonIndex===this.randomSum){
      const points = Math.max(1, Math.floor(this._timerWidth / 4));
      this.score += points; this.correctAnswers++;
      const btn = this.buttons[buttonIndex];
      this.emitter.explode(18, btn.x, btn.y-20);
      const floating = this._getFloatText(btn.x, btn.y-70, `+${points}`);
      this.tweens.add({ targets:floating, y:floating.y-60, alpha:0, duration:550, ease:"Cubic.easeOut",
        onComplete:()=> this._recycleFloatText(floating) });
      this.cameras.main.shake(60, 0.002); this._haptic(25);
      this.nextNumber();
    } else {
      if(this.timeTween) this.timeTween.stop();
      this.gameOver((buttonIndex+1).toString());
    }
  }

  async gameOver(str){
    this.gamePhase = "gameover"; this.isGameOver = true; this.setButtonsInteractive(false);
    this.buttons.forEach(b=>{ b.bg.setTexture("btn-normal").clearTint().setAlpha(0.6); b.txt.setAlpha(0.6); });

    this.questionText.setText(this.questionText.text + " = " + str);
    this.cameras.main.flash(100, 255, 30, 30);
    this.cameras.main.shake(220, 0.01); this._haptic(35);

    const newTop = Math.max(this.score, this.topScore);
    localStorage.setItem(gameOptions.localStorageName, newTop.toString());
    this.topScore = newTop;

    if (!this.gamerTag) { await this._askForGamerTag(); }

    try { await saveBestScore(this.score, this.gamerTag || "Player"); }
    catch (e) { console.warn("saveBestScore failed", e); }

    this.refreshMyRank(true);
    this._showTapToStart();
  }

  // ----- Start/Retry UX -----
  _showTapToStart(){
    this.gamePhase = "idle"; this.setButtonsInteractive(false);
    this.buttons.forEach(b=>{ b.bg.setAlpha(1); b.txt.setAlpha(1); });
    this.questionText.setText("-");

    const prompt = this.add.text(BASE_WIDTH/2, BASE_HEIGHT*0.88, "Tap to start", {
      fontFamily:"system-ui", fontSize:"38px", color:this.colors.retry
    }).setOrigin(0.5).setAlpha(0).setDepth(200);
    this.tweens.add({ targets:prompt, alpha:1, yoyo:true, repeat:-1, duration:700, ease:"Sine.easeInOut" });

    const blocker = this.add.zone(0,0,BASE_WIDTH,BASE_HEIGHT).setOrigin(0)
      .setInteractive({ useHandCursor:true }).setDepth(190);

    blocker.once("pointerdown", async ()=>{
      prompt.destroy(); blocker.disableInteractive();
      await this._beginReadyGo();
      blocker.destroy();
    });

    this.refreshMyRank();
  }

  async _beginReadyGo(){
    this.gamePhase = "countdown";

    const dim = this.add.rectangle(0,0,BASE_WIDTH,BASE_HEIGHT,0x000000,0.55).setOrigin(0).setDepth(210);
    const bigText = this.add.text(BASE_WIDTH/2, BASE_HEIGHT*0.45, "Ready?", {
      fontFamily:"system-ui", fontSize:"120px", fontStyle:"900", color:this.colors.textMain, stroke:"#ff2bd6", strokeThickness:3
    }).setOrigin(0.5).setDepth(220).setScale(0.9).setAlpha(0);

    await new Promise((res)=>{
      this.tweens.add({
        targets: bigText, alpha:1, scale:1.05, duration:240, ease:"Back.Out",
        onStart:()=> this._haptic(20),
        onComplete:()=> setTimeout(res, 450)
      });
    });

    bigText.setText("Go!").setAlpha(0).setScale(0.7);
    await new Promise((res)=>{
      this.tweens.add({
        targets: bigText, alpha:1, scale:1.15, duration:180, ease:"Back.Out",
        onStart:()=> this._haptic(25),
        onComplete:()=> setTimeout(res, 250)
      });
    });

    await new Promise((res)=>{
      this.tweens.add({ targets:bigText, alpha:0, duration:180, ease:"Sine.InOut",
        onComplete:()=>{ dim.destroy(); bigText.destroy(); res(); } });
    });

    this.isGameOver=false; this.score=0; this.correctAnswers=0;
    this.nextNumber();
  }

  async refreshMyRank(force = false) {
    try {
      const now = performance.now();
      if (!force && this._lastRankFetch && (now - this._lastRankFetch) < 8000) return;
      this._lastRankFetch = now;
      await ready;
      const data = await getMyRank();
      if (!data) { this.rankText.setText("Rank: —"); return; }
      this.rankText.setText(`Rank: ${data.rank}`);
    } catch (e) { /* noop */ }
  }

  // ----- Gamer tag prompt -----
  _askForGamerTag() {
    return new Promise((resolve) => {
      const W = BASE_WIDTH, H = BASE_HEIGHT;
      const dim = this.add.rectangle(0,0,W,H,0x000000,0.55).setOrigin(0).setDepth(400).setInteractive();

      const panel = this.add.rectangle(W*0.5, H*0.5, Math.min(680, W*0.9), 300, 0x121826, 0.98)
        .setStrokeStyle(3, 0x14e6ff, 0.4).setDepth(401);

      const title = this.add.text(panel.x, panel.y-80, "Choose a Gamer Tag", {
        fontFamily:"system-ui", fontSize:"32px", color:"#eaf7ff"
      }).setOrigin(0.5).setDepth(401);

      const dom = this.add.dom(panel.x, panel.y-10).createFromHTML(`
        <input id="gtag" type="text" maxlength="24" placeholder="e.g. KenteKnight"
          style="padding:12px 16px;border-radius:10px;border:2px solid #14e6ff;
                 background:#0f1621;color:#eaf7ff;outline:none;width:70%;
                 font-size:18px;font-family:system-ui;" />
      `).setDepth(401);

      const el = dom.getChildByID("gtag");
      setTimeout(()=> { try { el?.focus(); el?.select?.(); } catch {} }, 50);

      panel.setInteractive({ useHandCursor: true }).on("pointerdown", () => el?.focus());

      const btn = this.add.text(panel.x, panel.y+70, "Save", {
        fontFamily:"system-ui", fontSize:"24px", color:"#eaf7ff", backgroundColor:"#233345"
      }).setPadding(14,8,14,8).setOrigin(0.5).setDepth(401).setInteractive({ useHandCursor:true });

      const close = () => { dim.destroy(); panel.destroy(); title.destroy(); dom.destroy(); btn.destroy(); };

      btn.on("pointerup", () => {
        const tag = (el?.value || "").trim();
        if (tag.length >= 2 && tag.length <= 24) {
          this.gamerTag = tag;
          localStorage.setItem("gamerTag", tag);
          close(); resolve();
        } else {
          btn.setText("2–24 chars ✨");
          this.tweens.add({ targets: btn, y: btn.y-3, yoyo:true, duration:80, repeat:2 });
        }
      });
    });
  }

  // ------- UI helpers -------
  updateScoreText(){ this.scoreText.setText(`Score: ${this.score}\nBest: ${this.topScore}`); }

  onResize({width,height}){
    const cam = this.cameras.main;
    const scaleX = width / BASE_WIDTH, scaleY = height / BASE_HEIGHT;
    const scale = Math.min(scaleX, scaleY); cam.setZoom(scale);
    const offsetX = (width - BASE_WIDTH*scale)*0.5/scale;
    const offsetY = (height - BASE_HEIGHT*scale)*0.5/scale;
    cam.setScroll(-offsetX, -offsetY);
  }

  // ---- Hover tween helpers ----
    _startHover(btn) {
    if (btn.hoverTween && btn.hoverTween.isPlaying()) return; // already pulsing
    // kill any past tweens on this target just in case
    this.tweens.killTweensOf(btn);

    btn.hoverTween = this.tweens.add({
        targets: btn,
        scale: 1.02,
        duration: 140,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
    });
    }

    _stopHover(btn) {
    if (btn.hoverTween) {
        btn.hoverTween.stop();
        btn.hoverTween.remove(); // fully detach from TweenManager
        btn.hoverTween = null;
    }
    btn.setScale(1);
    }

    setButtonsInteractive(enabled) {
    this.buttons?.forEach((b) => {
        if (!b?.hit) return;
        if (!enabled) {
        // kill hover + reset visuals when disabling
        this._stopHover(b);
        b.bg.setTexture("btn-normal").clearTint();
        b.txt.setAlpha(1);
        }
        enabled ? b.hit.setInteractive({ useHandCursor: true }) : b.hit.disableInteractive();
    });
    }


  _getFloatText(x,y,text){
    let t = this.floatPool.getFirstDead();
    if (!t){
      t = this.add.text(x,y,text,{ fontFamily:"system-ui, -apple-system, Segoe UI, Roboto", fontSize:"42px", fontStyle:"bold", color:this.colors.points })
        .setOrigin(0.5).setDepth(20);
      this.floatPool.add(t);
    } else {
      t.setText(text).setPosition(x,y).setStyle({ color:this.colors.points }); t.setAlpha(1); t.active=true; t.visible=true;
    }
    return t;
  }
  _recycleFloatText(t){ t.active=false; t.visible=false; }
  _haptic(ms=20){ if (navigator?.vibrate) navigator.vibrate(ms); }
}