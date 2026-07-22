// ============================================================
// Week 3 Example 2: Full Fighting Game
// ============================================================

// ------------------------------------------------------------
// GAME STATES
// The game is always in exactly one state at a time.
// Each state controls what gets drawn and what responds to input.
// Storing states as constants prevents typos — if you mistype
// STATE_FIGHT, JavaScript will throw an error instead of
// silently using the wrong string.
// ------------------------------------------------------------
const STATE_START = "start";
const STATE_FIGHT = "fight";
const STATE_WIN   = "win";

let gameState = STATE_START;
let winner = null; // stores "P1" or "P2" when the game ends

// ------------------------------------------------------------
// SOUNDS
// Loaded in preload() so they are ready before the game starts.
// punchSounds is an array — a random one plays on each hit
// so punches don't sound identical every time.
// ------------------------------------------------------------
let punchSounds = [];
let winSound;
let bgMusic;

// ------------------------------------------------------------
// FIGHTER CLASS
// Extended from Example 1 to include health, attacking,
// hit detection, and a visual flash when hit.
// ------------------------------------------------------------
class Fighter {
  // ----------------------------------------------------------
  // constructor()
  // Sets up all properties for this fighter instance.
  // "label" is new here — used to identify P1 or P2 when
  // determining the winner.
  // ----------------------------------------------------------
  constructor(x, y, colour, controls, label) {
    // Position and physics
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.speed = 0.5;
    this.maxSpeed = 4;
    this.friction = 0.78;
    this.r = 28;

    // Appearance
    this.colour = colour;
    this.label = label; // "P1" or "P2"
    this.blobT = random(100);

    // Controls
    this.controls = controls;

    // Health — 3 hits to lose
    this.maxHealth = 3;
    this.health = 3;

    // Attack state
    this.isAttacking = false;
    this.attackTimer = 0;
    this.attackDuration = 18;  // frames the punch stays active
    this.attackCooldown = 0;   // frames until this fighter can attack again
    this.punchReach = 55;      // how far the fist extends in pixels
    this.punchDir = 1;         // direction of punch: 1 = right, -1 = left

    // Block state
    this.isBlocking = false;

    // Hit flash — briefly turns white when hit
    this.hitFlash = 0;

    // Prevents registering more than one hit per attack swing
    this.hitLanded = false;
  }

  // ----------------------------------------------------------
  // update()
  // Called every frame during the FIGHT state.
  // Returns early if the game is not in progress.
  // ----------------------------------------------------------
  update() {
    if (gameState !== STATE_FIGHT) return;

    this.handleInput();
    this.applyPhysics();

    // Count down attack timer — ends the attack after attackDuration frames
    if (this.isAttacking) {
      this.attackTimer--;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        this.hitLanded = false;
        this.attackCooldown = 20; // short cooldown before next punch
      }
    }

    // Count down cooldown each frame until it reaches zero
    if (this.attackCooldown > 0) this.attackCooldown--;

    // Count down hit flash each frame until it reaches zero
    if (this.hitFlash > 0) this.hitFlash--;
  }

  // ----------------------------------------------------------
  // handleInput()
  // Reads keyboard state for this fighter's specific keys.
  // keyIsDown() returns true every frame the key is held —
  // this gives smooth continuous movement.
  // ----------------------------------------------------------
  handleInput() {
    if (keyIsDown(this.controls.left))  this.vx -= this.speed;
    if (keyIsDown(this.controls.right)) this.vx += this.speed;

    // Clamp speed — prevents infinite acceleration
    this.vx = constrain(this.vx, -this.maxSpeed, this.maxSpeed);

    // Friction — gradually slows the fighter when no key is pressed
    if (!keyIsDown(this.controls.left) && !keyIsDown(this.controls.right)) {
      this.vx *= this.friction;
    }

    // Block state — held key toggles blocking on/off each frame
    this.isBlocking = keyIsDown(this.controls.block);
  }

  // ----------------------------------------------------------
  // applyPhysics()
  // Moves the fighter and keeps them inside the canvas.
  // No gravity in this example — fighters stay on the ground.
  // ----------------------------------------------------------
  applyPhysics() {
    this.x += this.vx;
    this.x = constrain(this.x, this.r, width - this.r);
  }

  // ----------------------------------------------------------
  // startAttack()
  // Called from keyPressed() when the attack key is pressed.
  // Uses keyPressed() rather than keyIsDown() so the punch
  // fires once per press, not every frame.
  // targetX is the opponent's x position — used to set the
  // direction the fist extends.
  // ----------------------------------------------------------
  startAttack(targetX) {
    // Do nothing if already attacking or in cooldown
    if (this.isAttacking || this.attackCooldown > 0) return;

    this.isAttacking = true;
    this.attackTimer = this.attackDuration;
    this.hitLanded = false;

    // Punch extends toward the opponent
    this.punchDir = targetX > this.x ? 1 : -1;

    // Pick a random punch sound from the array for variety
    let randomPunch = punchSounds[floor(random(punchSounds.length))];
    randomPunch.play();
  }

  // ----------------------------------------------------------
  // getPunchX()
  // Returns the x position of the fist tip.
  // Used in checkHits() to test whether the punch connects.
  // ----------------------------------------------------------
  getPunchX() {
    return this.x + this.punchDir * this.punchReach;
  }

  // ----------------------------------------------------------
  // takeHit()
  // Called on this fighter when the opponent's punch connects.
  // Blocked punches deal no damage.
  // ----------------------------------------------------------
  takeHit() {
    if (this.isBlocking) return; // blocked — no damage

    this.health--;
    this.hitFlash = 12; // flash white for 12 frames

    // If health reaches zero, end the game
    if (this.health <= 0) {
      this.health = 0;
      // The winner is whichever fighter is NOT this one
      endGame(this.label === "P1" ? "P2" : "P1");
    }
  }

  // ----------------------------------------------------------
  // draw()
  // Draws the shield ring, fist, blob body, and eyes.
  // push() and pop() isolate drawing styles to this method.
  // ----------------------------------------------------------
  draw() {
    push();

    // Shield ring when blocking
    if (this.isBlocking) {
      noFill();
      stroke(255, 255, 255, 150);
      strokeWeight(3);
      ellipse(this.x, this.y, (this.r + 16) * 2, (this.r + 16) * 2);
    }

    // Draw fist when attacking
    if (this.isAttacking) {
      fill(this.hitFlash > 0 ? color(255) : this.colour);
      noStroke();
      ellipse(this.getPunchX(), this.y, 20, 20);
    }

    // Blob body — flash white when hit, normal colour otherwise
    fill(this.hitFlash > 0 ? color(255) : this.colour);
    noStroke();

    beginShape();
    let numPoints = 48;
    for (let i = 0; i < numPoints; i++) {
      let angle = (TWO_PI / numPoints) * i;
      let noiseVal = noise(
        cos(angle) * 0.8 + this.blobT,
        sin(angle) * 0.8 + this.blobT,
      );
      let r = this.r + map(noiseVal, 0, 1, -7, 7);
      vertex(this.x + cos(angle) * r, this.y + sin(angle) * r);
    }
    endShape(CLOSE);

    // Eyes
    fill(10);
    ellipse(this.x - 9, this.y - 7, 8, 8);
    ellipse(this.x + 9, this.y - 7, 8, 8);

    pop();

    // Advance blob animation each frame
    this.blobT += 0.015;
  }
}

// ============================================================
// GLOBAL VARIABLES
// ============================================================
let fighter1, fighter2;
let groundY;

// ============================================================
// preload()
// Runs once before setup(). Loads all sounds so they are
// ready before the game starts.
// ============================================================
function preload() {
  // Load all 9 punch sounds into an array
  // A random one will be picked each time a punch lands
  for (let i = 1; i <= 9; i++) {
    punchSounds.push(loadSound("assets/sounds/punch_" + i + ".wav"));
  }
  winSound = loadSound("assets/sounds/win.wav");
  bgMusic  = loadSound("assets/sounds/background.mp3");
}

// ============================================================
// setup()
// Runs once at the very start of the sketch.
// Creates the canvas and both fighter instances.
// ============================================================
function setup() {
  createCanvas(800, 450);
  groundY = height - 80;
  setupFighters();
}

// ------------------------------------------------------------
// setupFighters()
// Creates both fighter instances with their starting
// positions, colours, and control keys.
// Called on setup and again on rematch to reset state.
//
// Key code reference:
// 65=A, 68=D, 70=F, 71=G (Player 1)
// LEFT_ARROW=37, RIGHT_ARROW=39, 75=K, 76=L (Player 2)
// ------------------------------------------------------------
function setupFighters() {
  fighter1 = new Fighter(
    200,
    groundY - 28,
    color(0, 200, 180), // teal
    { left: 65, right: 68, attack: 70, block: 71 }, // A D F G
    "P1",
  );

  fighter2 = new Fighter(
    600,
    groundY - 28,
    color(255, 150, 30), // orange
    { left: LEFT_ARROW, right: RIGHT_ARROW, attack: 75, block: 76 }, // Arrows K L
    "P2",
  );
}

// ============================================================
// draw()
// Runs repeatedly in a loop after setup() finishes.
// Switches what gets drawn based on the current game state.
// ============================================================
function draw() {
  background(10);

  if (gameState === STATE_START) {
    drawStartScreen();
  } else if (gameState === STATE_FIGHT) {
    drawArena();
    updateAndDrawFighters();
    checkHits();
    drawHealthBars();
    drawFightHUD();
  } else if (gameState === STATE_WIN) {
    drawArena();
    fighter1.draw();
    fighter2.draw();
    drawWinScreen();
  }
}

// ============================================================
// GAME STATE FUNCTIONS
// ============================================================

// ------------------------------------------------------------
// startGame()
// Transitions to the FIGHT state, resets fighters,
// and starts background music.
// ------------------------------------------------------------
function startGame() {
  gameState = STATE_FIGHT;
  winner = null;
  setupFighters();
  if (!bgMusic.isPlaying()) {
    bgMusic.loop();
  }
}

// ------------------------------------------------------------
// endGame()
// Transitions to the WIN state, stores the winner's label,
// stops music, and plays the win sound.
// ------------------------------------------------------------
function endGame(winnerLabel) {
  gameState = STATE_WIN;
  winner = winnerLabel;
  bgMusic.stop();
  winSound.play();
}

// ============================================================
// DRAW FUNCTIONS
// ============================================================

// ------------------------------------------------------------
// drawStartScreen()
// Displayed before the game begins.
// ------------------------------------------------------------
function drawStartScreen() {
  // Title
  fill(255);
  textAlign(CENTER);
  textSize(52);
  text("BLOB BRAWL", width / 2, height / 2 - 60);

  // Subtitle
  fill(160);
  textSize(18);
  text("First to land 3 hits wins", width / 2, height / 2 - 20);

  // Controls — each player shown in their colour
  textSize(14);
  fill(0, 200, 180);
  text("P1: A/D move   F attack   G block", width / 2, height / 2 + 30);
  fill(255, 150, 30);
  text("P2: Arrows move   K attack   L block", width / 2, height / 2 + 55);

  // Start prompt
  fill(255);
  textSize(16);
  text("Press ENTER to start", width / 2, height / 2 + 110);
}

// ------------------------------------------------------------
// drawWinScreen()
// Displayed after a fighter's health reaches zero.
// A semi-transparent overlay sits on top of the arena.
// ------------------------------------------------------------
function drawWinScreen() {
  // Semi-transparent overlay
  fill(0, 0, 0, 160);
  rect(0, 0, width, height);

  // Winner text — shown in the winner's colour
  fill(winner === "P1" ? color(0, 200, 180) : color(255, 150, 30));
  textAlign(CENTER);
  textSize(56);
  text(winner + " WINS!", width / 2, height / 2 - 30);

  // Rematch prompt
  fill(255);
  textSize(18);
  text("Press ENTER to rematch", width / 2, height / 2 + 40);
}

// ------------------------------------------------------------
// drawArena()
// Draws the ground plane and dividing line.
// ------------------------------------------------------------
function drawArena() {
  fill(40);
  noStroke();
  rect(0, groundY, width, height - groundY);

  stroke(80);
  strokeWeight(1);
  line(0, groundY, width, groundY);
}

// ------------------------------------------------------------
// updateAndDrawFighters()
// Updates physics and input, then draws both fighters.
// Separated from draw() to keep it readable.
// ------------------------------------------------------------
function updateAndDrawFighters() {
  fighter1.update();
  fighter2.update();
  fighter1.draw();
  fighter2.draw();
}

// ------------------------------------------------------------
// checkHits()
// Called every frame during the FIGHT state.
// Checks if an attacking fighter's fist overlaps the opponent.
// hitLanded prevents the same swing from registering twice.
// ------------------------------------------------------------
function checkHits() {
  // Fighter 1 hitting Fighter 2
  if (fighter1.isAttacking && !fighter1.hitLanded) {
    let fistX = fighter1.getPunchX();
    let dist = abs(fistX - fighter2.x);
    if (dist < fighter2.r + 10) {
      fighter2.takeHit();
      fighter1.hitLanded = true;
    }
  }

  // Fighter 2 hitting Fighter 1
  if (fighter2.isAttacking && !fighter2.hitLanded) {
    let fistX = fighter2.getPunchX();
    let dist = abs(fistX - fighter1.x);
    if (dist < fighter1.r + 10) {
      fighter1.takeHit();
      fighter2.hitLanded = true;
    }
  }
}

// ------------------------------------------------------------
// drawHealthBars()
// Drawn as two rect()s per player — a grey background bar
// and a coloured health bar that shrinks as health decreases.
// map() converts health (0–3) to bar width in pixels.
// ------------------------------------------------------------
function drawHealthBars() {
  let barW    = 200;
  let barH    = 18;
  let barY    = 45;
  let padding = 30;

  // Player 1 health bar — left side, fills left to right
  let p1W = map(fighter1.health, 0, fighter1.maxHealth, 0, barW);
  fill(40);
  rect(padding, barY, barW, barH, 4);
  fill(0, 200, 180);
  rect(padding, barY, p1W, barH, 4);

  // Player 2 health bar — right side, fills right to left
  let p2W = map(fighter2.health, 0, fighter2.maxHealth, 0, barW);
  fill(40);
  rect(width - padding - barW, barY, barW, barH, 4);
  fill(255, 150, 30);
  rect(width - padding - p2W, barY, p2W, barH, 4);

  // Labels
  fill(255);
  textSize(13);
  noStroke();
  textAlign(LEFT);
  text("P1", padding, barY - 5);
  textAlign(RIGHT);
  text("P2", width - padding, barY - 5);
}

// ------------------------------------------------------------
// drawFightHUD()
// HUD = Heads Up Display.
// Shows controls at the bottom of the screen during a fight.
// ------------------------------------------------------------
function drawFightHUD() {
  noStroke();
  fill(120);
  textSize(12);
  textAlign(LEFT);
  text("A/D move   F attack   G block", 16, height - 12);
  textAlign(RIGHT);
  text("Arrows move   K attack   L block", width - 16, height - 12);
}

// ============================================================
// keyPressed()
// Used for actions that fire ONCE per press (attack, start).
// keyIsDown() is used for held actions (movement, blocking).
// This is an important distinction — keyPressed() fires once
// per keypress, keyIsDown() fires every frame the key is held.
// ============================================================
function keyPressed() {
  // Start or rematch — only responds to ENTER
  if (keyCode === ENTER) {
    if (gameState === STATE_START || gameState === STATE_WIN) {
      startGame();
    }
  }

  // Player 1 attack — F key (keyCode 70)
  if (keyCode === 70 && gameState === STATE_FIGHT) {
    fighter1.startAttack(fighter2.x);
  }

  // Player 2 attack — K key (keyCode 75)
  if (keyCode === 75 && gameState === STATE_FIGHT) {
    fighter2.startAttack(fighter1.x);
  }
}
