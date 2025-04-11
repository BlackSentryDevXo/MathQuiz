const gameOptions = {
    maxSumLen: 5,
    localStorageName: "oneplustwo",
    timeToAnswer: 3000,
    nextLevel: 400
};

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.isGameOver = false;
        this.score = 0;
        this.correctAnswers = 0;
        this.topScore = localStorage.getItem(gameOptions.localStorageName) || 0;
        this.sumsArray = [];
    }

    preload() {
        this.load.image('timebar', 'timebar.png');
        this.load.spritesheet('buttons', 'buttons.png', { frameWidth: 400, frameHeight: 50 });
    }

    create() {
        // Scale settings
        this.cameras.main.setBackgroundColor(0x444444);
        this.scale.scaleMode = Phaser.Scale.RESIZE;
        this.scale.pageAlignHorizontally = true;
        this.scale.pageAlignVertically = true;

        // Score Text
        this.scoreText = this.add.text(10, 10, `Score: ${this.score}\nBest Score: ${this.topScore}`, {
            font: '24px Arial',
            color: '#FFFFFF'
        });

        // Timer (Time Bar)
        let numberTimer = this.add.sprite(50, 250, 'timebar');
        this.buttonMask = this.add.graphics();
        this.buttonMask.fillStyle(0xffffff, 1);
        this.buttonMask.fillRect(50, 250, 400, 200);
        numberTimer.setMask(new Phaser.Display.Masks.GeometryMask(this, this.buttonMask));

        // Buttons
        this.buttons = [];
        for (let i = 0; i < 3; i++) {
            let button = this.add.sprite(50, 250 + i * 75, 'buttons', i).setInteractive();
            button.on('pointerdown', this.checkAnswer, this);
            this.buttons.push(button);
        }

        // Question Text
        this.questionText = this.add.text(640, 160, '-', {
            font: 'bold 72px Arial',
            color: '#FFFFFF'
        }).setOrigin(0.5);

        // Initialize sums
        this.buildSums();
        this.nextNumber();
    }

    buildSums() {
        // Build all possible sums
        for (let i = 1; i < gameOptions.maxSumLen; i++) {
            this.sumsArray[i] = [[], [], []];

            for (let j = 1; j <= 3; j++) {
                this.buildThrees(j, 1, i, j);
            }
        }
    }

    buildThrees(initialNumber, currentIndex, limit, currentString) {
        const numbersArray = [-3, -2, -1, 1, 2, 3];

        for (let i = 0; i < numbersArray.length; i++) {
            let sum = initialNumber + numbersArray[i];
            let outputString = currentString + (numbersArray[i] < 0 ? '' : '+') + numbersArray[i];

            if (sum > 0 && sum < 4 && currentIndex === limit) {
                this.sumsArray[limit][sum - 1].push(outputString);
            }

            if (currentIndex < limit) {
                this.buildThrees(sum, currentIndex + 1, limit, outputString);
            }
        }
    }

    nextNumber() {
        this.scoreText.setText(`Score: ${this.score}\nBest Score: ${this.topScore}`);

        if (this.correctAnswers > 1) {
            this.timeTween.stop();
            this.buttonMask.x = 50;
        }

        if (this.correctAnswers > 0) {
            this.timeTween = this.tweens.add({
                targets: this.buttonMask,
                x: -350,
                duration: gameOptions.timeToAnswer,
                ease: 'Linear',
                onComplete: () => {
                    this.gameOver("?");
                }
            });
        }

        // Random question generation
        this.randomSum = Phaser.Math.Between(0, 2);
        const questionLength = Math.min(Math.floor(this.score / gameOptions.nextLevel) + 1, 4);
        this.questionText.setText(this.sumsArray[questionLength][this.randomSum][Phaser.Math.Between(0, this.sumsArray[questionLength][this.randomSum].length - 1)]);
    }

    checkAnswer(button) {
        if (!this.isGameOver) {
            // Check if the button's frame index matches the correct answer
            if (button.frame === this.randomSum) {
                this.score += Math.floor((this.buttonMask.x + 350) / 4);
                this.correctAnswers++;
                this.nextNumber();
            } else {
                if (this.correctAnswers > 1) {
                    this.timeTween.stop();
                }
                this.gameOver(button.frame + 1);
            }
        }
    }

    gameOver(gameOverString) {
        this.cameras.main.setBackgroundColor(0xff0000);
        this.questionText.setText(`${this.questionText.text} = ${gameOverString}`);
        this.isGameOver = true;
        localStorage.setItem(gameOptions.localStorageName, Math.max(this.score, this.topScore));

        // Restart game after 2 seconds
        this.time.delayedCall(2000, () => {
            this.scene.restart();
        });
    }
}

// Phaser game configuration
const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    scene: [MainScene]
};

let game = new Phaser.Game(config);