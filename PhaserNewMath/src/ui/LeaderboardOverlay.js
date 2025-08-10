import { loadTop } from "../services/firebase.js";

export default class LeaderboardOverlay extends Phaser.GameObjects.Container {
  constructor(scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(500);
    this.setScrollFactor(0);

    // Remember previous input mode; we force top-most while overlay is visible
    this._prevTopOnly = scene.input.topOnly;

    const cam = scene.cameras.main;
    const W = cam.width;
    const H = cam.height;

    // Dim
    this.dim = scene.add
      .rectangle(0, 0, W, H, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();
    this.dim.on("pointerdown", (pointer, x, y, event) => event?.stopPropagation());

    // Panel
    this.panel = scene.add
      .rectangle(W * 0.5, H * 0.5, Math.min(760, W * 0.9), Math.min(900, H * 0.85), 0x121826, 0.98)
      .setStrokeStyle(3, 0x14e6ff, 0.4);

    // Title
    this.title = scene.add
      .text(this.panel.x, this.panel.y - this.panel.height / 2 + 36, "Leaderboard", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "36px",
        fontStyle: "bold",
        color: "#eaf7ff",
      })
      .setOrigin(0.5, 0.5);

    // Viewport area for rows (TOP-ALIGNED now)
    const listW = this.panel.width - 60;
    const listH = this.panel.height - 140;
    const listTopY = this.panel.y - this.panel.height / 2 + 70; // below title
    this.listContainer = scene.add.container(this.panel.x, listTopY).setSize(listW, listH);
    // interactive rect from top-left of listContainer
    this.listContainer.setInteractive(
      new Phaser.Geom.Rectangle(-listW / 2, 0, listW, listH),
      Phaser.Geom.Rectangle.Contains
    );
    this.listContainer.on("pointerdown", (pointer, x, y, event) => event?.stopPropagation());

    // Close button
    this.closeBtn = scene.add
      .text(
        this.panel.x + this.panel.width / 2 - 24,
        this.panel.y - this.panel.height / 2 + 12,
        "✕",
        { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto", fontSize: "28px", color: "#9fd2ff" }
      )
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.closeBtn.on("pointerdown", (pointer, x, y, event) => event?.stopPropagation());
    this.closeBtn.on("pointerup", (pointer, x, y, event) => { event?.stopPropagation(); this.hide(); });

    // Paging
    this.pageInfo = scene.add
      .text(this.panel.x, this.panel.y + this.panel.height / 2 - 30, "", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "18px",
        color: "#9fd2ff",
      })
      .setOrigin(0.5);

    this.prevBtn = scene.add
      .text(this.panel.x - 120, this.pageInfo.y, "Prev", {
        fontFamily: "system-ui",
        fontSize: "20px",
        color: "#eaf7ff",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.nextBtn = scene.add
      .text(this.panel.x + 120, this.pageInfo.y, "Next", {
        fontFamily: "system-ui",
        fontSize: "20px",
        color: "#eaf7ff",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.prevBtn.on("pointerdown", (pointer, x, y, event) => event?.stopPropagation());
    this.nextBtn.on("pointerdown", (pointer, x, y, event) => event?.stopPropagation());
    this.prevBtn.on("pointerup",   (pointer, x, y, event) => { event?.stopPropagation(); this._loadPage(-1); });
    this.nextBtn.on("pointerup",   (pointer, x, y, event) => { event?.stopPropagation(); this._loadPage(1);  });

    // Add children
    this.add(this.dim);
    this.add(this.panel);
    this.add(this.title);
    this.add(this.listContainer);
    this.add(this.prevBtn);
    this.add(this.nextBtn);
    this.add(this.pageInfo);
    this.add(this.closeBtn);

    // Paging state
    this.pageSize = 50;
    this.pages = [];
    this.pageIndex = 0;
    this.lastDocForPage = [];

    this.visible = false;
    this.alpha = 0;
    this._isLoading = false;

    // Row style constants
    this.rowH = 48;
    this.rowPadX = 12;
    this.colors = {
      chipFill: 0x0f2235,
      chipStroke: 0x14e6ff,
      chipStrokeAlpha: 0.35,
      name: "#eaf7ff",
      rank: "#7afcff",
      score: "#39ffb0"
    };
  }

  async show() {
    if (this.visible) return;
    this.visible = true;
    this.scene.input.topOnly = true;
    this.alpha = 0;
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 180, ease: "Sine.Out" });

    if (!this.lastDocForPage[0]) {
      await this._loadPage(0, true);
    } else {
      this._renderList(this.pages[this.pageIndex]);
    }
  }

  hide() {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 140,
      ease: "Sine.In",
      onComplete: () => {
        this.visible = false;
        this.scene.input.topOnly = this._prevTopOnly;
      },
    });
  }

  async _loadPage(direction = 0, forceFirst = false) {
    if (this._isLoading) return;
    this._isLoading = true;

    try {
      if (forceFirst) {
        const snap = await loadTop(this.pageSize, null);
        this.pages[0] = snap;
        this.pageIndex = 0;
        this.lastDocForPage[0] = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
        this._renderList(snap);
        return;
      }

      if (direction === 0) {
        this._renderList(this.pages[this.pageIndex]);
        return;
      }

      const targetIndex = this.pageIndex + direction;
      if (targetIndex < 0) return;

      if (this.pages[targetIndex]) {
        this.pageIndex = targetIndex;
        this._renderList(this.pages[this.pageIndex]);
        return;
      }

      const startAfterDoc = this.lastDocForPage[this.pageIndex];
      if (!startAfterDoc) return;

      const snap = await loadTop(this.pageSize, startAfterDoc);
      this.pages[targetIndex] = snap;
      this.lastDocForPage[targetIndex] = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
      this.pageIndex = targetIndex;
      this._renderList(snap);
    } finally {
      this._isLoading = false;
    }
  }

  _renderList(snap) {
    this.listContainer.removeAll(true);

    const rows = Math.min(snap.size, this.pageSize);
    const maxVisible = Math.floor(this.listContainer.height / this.rowH);
    const shown = Math.min(rows, maxVisible);
    const startY = this.rowH / 2; // TOP-ALIGNED

    for (let i = 0; i < shown; i++) {
      const d = snap.docs[i];
      const data = d.data();
      const rank = this.pageIndex * this.pageSize + i + 1;

      const rowY = startY + i * this.rowH;

      // Row container anchored to top-left of the list viewport
      const row = this.scene.add.container(-this.listContainer.width / 2, rowY);

      // Neon pill background (Graphics with rounded rect)
      const g = this.scene.add.graphics();
      g.lineStyle(2, this.colors.chipStroke, this.colors.chipStrokeAlpha);
      g.fillStyle(this.colors.chipFill, 0.9);
      const pillW = this.listContainer.width;
      const pillH = this.rowH + 8;
      g.fillRoundedRect(0, -pillH / 2, pillW, pillH, 12);
      g.strokeRoundedRect(0, -pillH / 2, pillW, pillH, 12);

      // Rank (left)
      const rankText = this.scene.add.text(12, 0, `${rank}.`, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "22px",
        fontStyle: "bold",
        color: this.colors.rank
      }).setOrigin(0, 0.5);

      // Name (middle, bigger)
      const nameX = 70;
      const nameText = this.scene.add.text(nameX, 0, `${data.gamerTag || "Player"}`, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "24px",
        fontStyle: "bold",
        color: this.colors.name
      }).setOrigin(0, 0.5);

      // Score (right)
      const scoreText = this.scene.add.text(pillW - 14, 0, `${data.score}`, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "24px",
        fontStyle: "bold",
        color: this.colors.score
      }).setOrigin(1, 0.5);

      row.add([g, rankText, nameText, scoreText]);
      this.listContainer.add(row);
    }

    this.pageInfo.setText(`Page ${this.pageIndex + 1}`);
    this.prevBtn.setAlpha(this.pageIndex > 0 ? 1 : 0.35);
    this.nextBtn.setAlpha(snap.size === this.pageSize ? 1 : 0.35);
  }
}