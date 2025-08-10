import { loadTop } from "../services/firebase.js";

export default class LeaderboardOverlay extends Phaser.GameObjects.Container {
  constructor(scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(500);
    this.setScrollFactor(0);

    // Use camera size for reliability
    const cam = scene.cameras.main;
    const W = cam.width;
    const H = cam.height;

    // Dim (capture clicks so game underneath doesn't get them)
    this.dim = scene.add
      .rectangle(0, 0, W, H, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();
    this.dim.on("pointerdown", (e) => e.stopPropagation());

    // Panel
    this.panel = scene.add
      .rectangle(W * 0.5, H * 0.5, Math.min(760, W * 0.9), Math.min(900, H * 0.85), 0x121826, 0.98)
      .setStrokeStyle(3, 0x14e6ff, 0.4);

    // Title
    this.title = scene.add
      .text(this.panel.x, this.panel.y - this.panel.height / 2 + 40, "Leaderboard", {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        fontSize: "36px",
        fontStyle: "bold",
        color: "#eaf7ff",
      })
      .setOrigin(0.5, 0.5);

    // Scrollable list container (rename to avoid clobbering Container.list!)
    this.listContainer = scene.add
      .container(this.panel.x, this.panel.y)
      .setSize(this.panel.width - 60, this.panel.height - 140);
    this.listContainer.setInteractive(
      new Phaser.Geom.Rectangle(-this.listContainer.width / 2, -this.listContainer.height / 2, this.listContainer.width, this.listContainer.height),
      Phaser.Geom.Rectangle.Contains
    );
    this.listContainer.on("pointerdown", (e) => e.stopPropagation());

    // Close button
    this.closeBtn = scene.add
      .text(
        this.panel.x + this.panel.width / 2 - 24,
        this.panel.y - this.panel.height / 2 + 16,
        "✕",
        { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto", fontSize: "28px", color: "#9fd2ff" }
      )
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.closeBtn.on("pointerdown", (e) => e.stopPropagation());
    this.closeBtn.on("pointerup", () => this.hide());

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

    this.prevBtn.on("pointerdown", (e) => e.stopPropagation());
    this.nextBtn.on("pointerdown", (e) => e.stopPropagation());
    this.prevBtn.on("pointerup", () => this._loadPage(-1));
    this.nextBtn.on("pointerup", () => this._loadPage(1));

    // Add children one-by-one (avoid the array .add path)
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
    this.pages = [];            // cached QuerySnapshots per page
    this.pageIndex = 0;
    this.lastDocForPage = [];   // last doc per page for startAfter

    this.visible = false;
    this._isLoading = false;
  }

  async show() {
    if (this.visible) return;
    this.visible = true;
    this.alpha = 0;
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 180, ease: "Sine.Out" });

    if (!this.lastDocForPage[0]) {
      await this._loadPage(0, true); // first load
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
      onComplete: () => { this.visible = false; },
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

      // fetch next page from last known doc
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
    const startY = -(rows * 28) / 2;

    for (let i = 0; i < rows; i++) {
      const d = snap.docs[i];
      const data = d.data();
      const rank = this.pageIndex * this.pageSize + i + 1;

      const line = this.scene.add
        .text(
          -this.listContainer.width / 2 + 10,
          startY + i * 28,
          `${rank.toString().padStart(2, " ")}. ${data.gamerTag || "Player"} — ${data.score}`,
          { fontFamily: "system-ui", fontSize: "22px", color: "#eaf7ff" }
        )
        .setOrigin(0, 0.5);

      this.listContainer.add(line);
    }

    this.pageInfo.setText(`Page ${this.pageIndex + 1}`);
    this.prevBtn.setAlpha(this.pageIndex > 0 ? 1 : 0.35);
    this.nextBtn.setAlpha(snap.size === this.pageSize ? 1 : 0.35);
  }
}