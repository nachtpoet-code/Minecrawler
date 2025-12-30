// Minecrawler - Ein Minesweeper-Roguelike

const Game = {
    // Canvas & Rendering
    canvas: null,
    ctx: null,

    // Grid Configuration
    cols: 10,
    rows: 8,
    cellSize: 50,

    // Game State
    grid: [],
    player: { x: 0, y: 0 },
    level: 1,
    gameOver: false,
    levelComplete: false,
    detectedBy: null, // Position des Gegners, der den Spieler entdeckt hat

    // Rauchgranaten
    smokeGrenades: 3,
    smokeMode: false,

    // Long Press für Markierung
    longPressTimer: null,
    longPressDelay: 500,
    longPressTriggered: false,
    lastTouchTime: 0,
    touchStartPos: { x: 0, y: 0 },

    // Difficulty scaling
    baseEnemyDensity: 0.15,

    // Colors
    colors: {
        hidden: '#1a1a2e',
        revealed: '#252540',
        player: '#00ff88',
        enemy: '#ff3344',
        goal: '#00ccff',
        border: '#333355',
        text: '#e0e0e0',
        smoke: '#8855ff',
        flagged: '#ff8800',
        numbers: ['#00ff88', '#00ccff', '#ffcc00', '#ff8800', '#ff3344', '#ff00ff', '#ffffff', '#888888']
    },

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.setupEventListeners();
        this.handleResize();
        this.startNewGame();

        window.addEventListener('resize', () => this.handleResize());
    },

    handleResize() {
        const gameArea = document.getElementById('game-area');
        const isMobile = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;

        // Auf Mobilgeräten: vertikales Layout (mehr Reihen als Spalten)
        if (isMobile) {
            this.cols = 6;
            this.rows = 10;
        } else {
            // Desktop: horizontales Layout
            this.cols = 12;
            this.rows = 7;
        }

        // Zellengroesse berechnen - Fallback wenn Layout noch nicht fertig
        const maxWidth = Math.max(gameArea.clientWidth - 40, 200);
        const maxHeight = Math.max(gameArea.clientHeight - 40, 300);

        this.cellSize = Math.max(
            20, // Minimum Zellengröße
            Math.min(
                Math.floor(maxWidth / this.cols),
                Math.floor(maxHeight / this.rows),
                60 // Max Zellengröße
            )
        );

        this.canvas.width = this.cols * this.cellSize;
        this.canvas.height = this.rows * this.cellSize;

        this.render();
    },

    setupEventListeners() {
        // Click auf Canvas (nur für Desktop)
        this.canvas.addEventListener('click', (e) => {
            // Ignorieren wenn Touch-Gerät (touch events übernehmen)
            if (this.lastTouchTime && Date.now() - this.lastTouchTime < 500) return;
            this.handleClick(e);
        });

        // Rechtsklick für Markierung
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleRightClick(e);
        });

        // Touch Events für Long Press
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Verhindert Ghost-Clicks
            this.lastTouchTime = Date.now();
            this.longPressTriggered = false;
            const touch = e.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
            this.startLongPress(touch);
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.lastTouchTime = Date.now();

            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }

            // Nur Click ausführen wenn kein Long Press war
            if (!this.longPressTriggered) {
                const touch = e.changedTouches[0];
                this.handleClick(touch);
            }
            this.longPressTriggered = false;
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            // Long Press abbrechen wenn Finger bewegt wird
            if (this.longPressTimer) {
                const touch = e.touches[0];
                const dx = Math.abs(touch.clientX - this.touchStartPos.x);
                const dy = Math.abs(touch.clientY - this.touchStartPos.y);
                if (dx > 10 || dy > 10) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
        });

        // Keyboard
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Buttons
        document.getElementById('restart-btn').addEventListener('click', () => this.startNewGame());
        document.getElementById('next-level-btn').addEventListener('click', () => this.nextLevel());

        // Smoke Button
        document.getElementById('smoke-btn').addEventListener('click', () => this.toggleSmokeMode());
    },

    startLongPress(touch) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((touch.clientX - rect.left) / this.cellSize);
        const y = Math.floor((touch.clientY - rect.top) / this.cellSize);

        this.longPressTimer = setTimeout(() => {
            this.longPressTriggered = true;
            this.toggleFlag(x, y);
            this.longPressTimer = null;
        }, this.longPressDelay);
    },

    handleRightClick(e) {
        if (this.gameOver || this.levelComplete) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.cellSize);
        const y = Math.floor((e.clientY - rect.top) / this.cellSize);

        this.toggleFlag(x, y);
    },

    toggleFlag(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
        if (this.gameOver || this.levelComplete) return;

        const cell = this.grid[y][x];
        if (cell.revealed) return; // Aufgedeckte Felder nicht markieren

        cell.flagged = !cell.flagged;
        this.render();
    },

    toggleSmokeMode() {
        if (this.smokeGrenades <= 0) return;
        this.smokeMode = !this.smokeMode;
        document.getElementById('smoke-btn').classList.toggle('active', this.smokeMode);
    },

    handleClick(e) {
        if (this.gameOver || this.levelComplete) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.cellSize);
        const y = Math.floor((e.clientY - rect.top) / this.cellSize);

        if (this.smokeMode) {
            this.throwSmoke(x, y);
        } else {
            this.tryMove(x, y);
        }
    },

    throwSmoke(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
        if (this.smokeGrenades <= 0) return;

        const cell = this.grid[y][x];
        if (cell.smoked) return; // Bereits verräuchert

        cell.smoked = true;
        cell.revealed = true; // Rauch deckt das Feld auf (zeigt Gegner!)
        this.smokeGrenades--;
        this.smokeMode = false;

        document.getElementById('smoke-btn').classList.remove('active');
        this.updateUI();
        this.render();
    },

    handleKeyboard(e) {
        if (this.gameOver || this.levelComplete) return;

        // Q für Rauchgranaten-Modus
        if (e.key === 'q' || e.key === 'Q') {
            this.toggleSmokeMode();
            return;
        }

        const moves = {
            'ArrowUp': { dx: 0, dy: -1 },
            'ArrowDown': { dx: 0, dy: 1 },
            'ArrowLeft': { dx: -1, dy: 0 },
            'ArrowRight': { dx: 1, dy: 0 },
            'w': { dx: 0, dy: -1 },
            's': { dx: 0, dy: 1 },
            'a': { dx: -1, dy: 0 },
            'd': { dx: 1, dy: 0 }
        };

        if (moves[e.key]) {
            const { dx, dy } = moves[e.key];
            this.tryMove(this.player.x + dx, this.player.y + dy);
        }
    },

    tryMove(x, y) {
        // Prüfen ob Ziel ein Nachbarfeld ist
        const dx = Math.abs(x - this.player.x);
        const dy = Math.abs(y - this.player.y);

        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            // Nur horizontale/vertikale Bewegung (keine Diagonale)
            if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
                this.movePlayer(x, y);
            }
        }
    },

    movePlayer(x, y) {
        const cell = this.grid[y][x];
        cell.revealed = true;

        // 1. Gegner-Feld direkt betreten = IMMER Game Over
        if (cell.isEnemy) {
            this.player.x = x;
            this.player.y = y;
            this.detectedBy = { x, y }; // Der Gegner selbst
            this.triggerGameOver();
            return;
        }

        // 2. Prüfen ob ein nicht-umnebelter Gegner das Feld sieht (horizontal/vertikal)
        const directions = [
            { dx: 0, dy: -1 },  // oben
            { dx: 0, dy: 1 },   // unten
            { dx: -1, dy: 0 },  // links
            { dx: 1, dy: 0 }    // rechts
        ];

        for (const { dx, dy } of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                const neighbor = this.grid[ny][nx];
                if (neighbor.isEnemy && !neighbor.smoked) {
                    // Entdeckt von einem wachen Gegner!
                    this.player.x = x;
                    this.player.y = y;
                    this.detectedBy = { x: nx, y: ny }; // Position des Gegners
                    this.triggerGameOver();
                    return;
                }
            }
        }

        this.player.x = x;
        this.player.y = y;

        // Nachbarfelder aufdecken
        this.revealAroundPlayer();

        // Ziel erreicht?
        if (this.isGoal(x, y)) {
            this.levelComplete = true;
            this.render();
            this.showLevelComplete();
            return;
        }

        this.render();
    },

    triggerGameOver() {
        this.gameOver = true;

        // Gegner aufdecken der den Spieler entdeckt hat
        if (this.detectedBy) {
            this.grid[this.detectedBy.y][this.detectedBy.x].revealed = true;
        }

        this.render();

        // Kurze Verzögerung damit Spieler den Gegner sieht
        setTimeout(() => {
            this.showGameOver();
        }, 800);
    },

    isGoal(x, y) {
        const isMobile = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
        if (isMobile) {
            // Mobil: Ziel ist oben
            return y === 0;
        } else {
            // Desktop: Ziel ist rechts
            return x === this.cols - 1;
        }
    },

    startNewGame() {
        this.level = 1;
        this.hideOverlays();
        this.handleResize();
        this.generateLevel();
    },

    nextLevel() {
        this.level++;
        this.hideOverlays();
        this.generateLevel();
    },

    generateLevel() {
        this.gameOver = false;
        this.levelComplete = false;
        this.detectedBy = null;
        this.grid = [];
        this.smokeGrenades = 3;
        this.smokeMode = false;
        document.getElementById('smoke-btn').classList.remove('active');

        const isMobile = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;

        // Spieler-Startposition
        if (isMobile) {
            // Mobil: unten Mitte
            this.player.x = Math.floor(this.cols / 2);
            this.player.y = this.rows - 1;
        } else {
            // Desktop: links Mitte
            this.player.x = 0;
            this.player.y = Math.floor(this.rows / 2);
        }

        // Grid initialisieren
        for (let y = 0; y < this.rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                this.grid[y][x] = {
                    isEnemy: false,
                    revealed: false,
                    adjacentEnemies: 0,
                    smoked: false,
                    flagged: false
                };
            }
        }

        // Feinde platzieren
        const enemyDensity = this.baseEnemyDensity + (this.level - 1) * 0.02;
        const totalCells = this.cols * this.rows;
        const numEnemies = Math.floor(totalCells * Math.min(enemyDensity, 0.35));

        let placed = 0;
        while (placed < numEnemies) {
            const x = Math.floor(Math.random() * this.cols);
            const y = Math.floor(Math.random() * this.rows);

            // Nicht auf Startposition, nicht direkt neben Start, nicht auf Zielreihe/-spalte
            const isStart = (x === this.player.x && y === this.player.y);
            const isNextToStart = Math.abs(x - this.player.x) <= 1 && Math.abs(y - this.player.y) <= 1;
            const isGoalArea = isMobile ? (y === 0) : (x === this.cols - 1);
            const isStartArea = isMobile ? (y === this.rows - 1) : (x === 0);

            if (!isStart && !isNextToStart && !isGoalArea && !isStartArea && !this.grid[y][x].isEnemy) {
                this.grid[y][x].isEnemy = true;
                placed++;
            }
        }

        // Nachbar-Zahlen berechnen
        this.calculateAdjacentEnemies();

        // Startfeld und direkte Nachbarn aufdecken
        this.revealAroundPlayer();

        this.updateUI();
        this.render();
    },

    calculateAdjacentEnemies() {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (!this.grid[y][x].isEnemy) {
                    let count = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx;
                            const ny = y + dy;
                            if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                                if (this.grid[ny][nx].isEnemy) count++;
                            }
                        }
                    }
                    this.grid[y][x].adjacentEnemies = count;
                }
            }
        }
    },

    revealAroundPlayer() {
        // Spielerfeld und alle 4 direkten Nachbarn aufdecken
        const directions = [
            { dx: 0, dy: 0 },   // Spielerfeld selbst
            { dx: 0, dy: -1 },  // oben
            { dx: 0, dy: 1 },   // unten
            { dx: -1, dy: 0 },  // links
            { dx: 1, dy: 0 }    // rechts
        ];

        for (const { dx, dy } of directions) {
            const nx = this.player.x + dx;
            const ny = this.player.y + dy;
            if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                this.grid[ny][nx].revealed = true;
            }
        }
    },

    render() {
        if (!this.grid.length || !this.grid[0]) return; // Guard: Grid muss existieren

        const ctx = this.ctx;
        const size = this.cellSize;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const isMobile = window.innerWidth <= 768 && window.innerHeight > window.innerWidth;

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cell = this.grid[y][x];
                const px = x * size;
                const py = y * size;

                // Zellhintergrund
                if (this.isGoal(x, y)) {
                    ctx.fillStyle = this.colors.goal;
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(px, py, size, size);
                    ctx.globalAlpha = 1;
                } else if (cell.revealed) {
                    ctx.fillStyle = this.colors.revealed;
                    ctx.fillRect(px, py, size, size);
                } else {
                    ctx.fillStyle = this.colors.hidden;
                    ctx.fillRect(px, py, size, size);
                }

                // Zellrand
                ctx.strokeStyle = this.colors.border;
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, size, size);

                // Rauchgranate-Markierung
                if (cell.smoked) {
                    ctx.fillStyle = this.colors.smoke;
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(px + 4, py + 4, size - 8, size - 8);
                    ctx.globalAlpha = 1;

                    // Rauch-Symbol
                    ctx.fillStyle = this.colors.smoke;
                    ctx.font = `${size * 0.4}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('💨', px + size / 2, py + size / 2);
                }

                // Flaggen-Markierung (vermuteter Gegner)
                if (cell.flagged && !cell.revealed) {
                    ctx.fillStyle = this.colors.flagged;
                    ctx.font = `${size * 0.5}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⚠️', px + size / 2, py + size / 2);
                }

                // Zellinhalt
                if (cell.revealed && !cell.isEnemy && cell.adjacentEnemies > 0) {
                    // Zahl anzeigen
                    ctx.fillStyle = this.colors.numbers[cell.adjacentEnemies - 1];
                    ctx.font = `bold ${size * 0.5}px 'Courier New'`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(cell.adjacentEnemies, px + size / 2, py + size / 2);
                }

                // Feind anzeigen (nur wenn aufgedeckt = Game Over)
                if (cell.revealed && cell.isEnemy) {
                    ctx.fillStyle = this.colors.enemy;
                    ctx.beginPath();
                    ctx.arc(px + size / 2, py + size / 2, size * 0.3, 0, Math.PI * 2);
                    ctx.fill();

                    // X für Feind
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2;
                    const offset = size * 0.15;
                    ctx.beginPath();
                    ctx.moveTo(px + size / 2 - offset, py + size / 2 - offset);
                    ctx.lineTo(px + size / 2 + offset, py + size / 2 + offset);
                    ctx.moveTo(px + size / 2 + offset, py + size / 2 - offset);
                    ctx.lineTo(px + size / 2 - offset, py + size / 2 + offset);
                    ctx.stroke();
                }

                // Spieler
                if (x === this.player.x && y === this.player.y && !this.gameOver) {
                    ctx.fillStyle = this.colors.player;
                    ctx.beginPath();
                    ctx.arc(px + size / 2, py + size / 2, size * 0.35, 0, Math.PI * 2);
                    ctx.fill();

                    // Spieler-Richtungsindikator
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    if (isMobile) {
                        // Pfeil nach oben
                        ctx.moveTo(px + size / 2, py + size * 0.25);
                        ctx.lineTo(px + size * 0.35, py + size * 0.55);
                        ctx.lineTo(px + size * 0.65, py + size * 0.55);
                    } else {
                        // Pfeil nach rechts
                        ctx.moveTo(px + size * 0.7, py + size / 2);
                        ctx.lineTo(px + size * 0.4, py + size * 0.35);
                        ctx.lineTo(px + size * 0.4, py + size * 0.65);
                    }
                    ctx.closePath();
                    ctx.fill();
                }

                // Ziel-Markierung
                if (this.isGoal(x, y)) {
                    ctx.strokeStyle = this.colors.goal;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(px + 3, py + 3, size - 6, size - 6);
                }
            }
        }

        // Mögliche Züge hervorheben
        if (!this.gameOver && !this.levelComplete) {
            const moves = [
                { dx: 0, dy: -1 },
                { dx: 0, dy: 1 },
                { dx: -1, dy: 0 },
                { dx: 1, dy: 0 }
            ];

            for (const { dx, dy } of moves) {
                const nx = this.player.x + dx;
                const ny = this.player.y + dy;

                if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows) {
                    const px = nx * size;
                    const py = ny * size;

                    ctx.strokeStyle = this.colors.player;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
                    ctx.setLineDash([]);
                }
            }
        }
    },

    updateUI() {
        document.getElementById('level-display').textContent = `Level ${this.level}`;
        document.getElementById('smoke-count').textContent = this.smokeGrenades;

        const smokeBtn = document.getElementById('smoke-btn');
        smokeBtn.disabled = this.smokeGrenades <= 0;
    },

    showGameOver() {
        document.getElementById('game-over-screen').classList.remove('hidden');
    },

    showLevelComplete() {
        document.getElementById('level-complete-message').textContent =
            `Level ${this.level} geschafft! Bereit für mehr Gefahr?`;
        document.getElementById('level-complete-screen').classList.remove('hidden');
    },

    hideOverlays() {
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('level-complete-screen').classList.add('hidden');
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => Game.init());
