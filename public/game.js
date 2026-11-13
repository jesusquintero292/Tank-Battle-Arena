const socket = io();

const $ = id => document.getElementById(id);
const screens = ["home", "lobby", "gamePanel", "questionPanel", "scorePanel"];

// =====================================
// CONFIGURACIÓN
// =====================================

const MAX_PLAYERS = 8;
const TOTAL_ROUNDS = 6;

const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 750;

const TANK_RADIUS = 17;
const TANK_SPEED = 135;
const ROTATION_SPEED = 2.2;

const STATE_SEND_INTERVAL = 70; 
const MAX_FRAME_TIME = 0.04;

let roomCode = null;
let playerId = null;
let isHost = false;
let roomData = null;

let players = [];
let bullets = [];
let myTank = null;
let running = false;

let moveHeld = false;
let moveAngle = 0;
let rotationDirection = 1;
let activePointerId = null;

let lastTime = 0;
let lastStateSent = 0;

let questionTimer = null;
let questionStart = 0;
let questionAnswered = false;

let currentQuestion = null;
let currentRound = 1;
let obstacles = [];

const canvas = $("arena");
const ctx = canvas.getContext("2d");

canvas.width = ARENA_WIDTH;
canvas.height = ARENA_HEIGHT;

// =====================================
// PREGUNTAS
// =====================================

const QUESTIONS = [
  {
    q: 'What is the noun paired with the adjective "ASYNCHRONOUS"?',
    a: ["Teamwork", "Backlog", "Communication", "Deployment"],
    correct: 2
  },
  {
    q: 'Which adjective is used in the presentation to describe the noun "PROJECT"?',
    a: ["Flawless", "High-risk", "Approved", "Custom"],
    correct: 1
  },
  {
    q: 'According to the presentation, what is the adjective associated with the noun "DEVELOPER"?',
    a: ["Skilled", "High-risk", "Seamless", "Cluttered"],
    correct: 0
  },
  {
    q: 'According to the presentation, what is the adjective used for the noun "SOLUTION"?',
    a: ["Custom", "Overloaded", "Unresolved", "Approved"],
    correct: 0
  },
  {
    q: 'In the presentation, what adjective describes the noun "BACKLOG"?',
    a: ["Overloaded", "Unresolved", "Cluttered", "Skilled"],
    correct: 2
  },
  {
    q: 'What is the adjective corresponding to the noun "DEPLOYMENT"?',
    a: ["Flawless", "Seamless", "Approved", "Custom"],
    correct: 0
  }
];

// =====================================
// PANTALLAS Y SALA
// =====================================

function show(id) {
  screens.forEach(s => {
    $(s).classList.toggle("hidden", s !== id);
  });
}

function myName() {
  return $("playerName").value.trim().slice(0, 16) || "Jugador";
}

$("createBtn").onclick = () => {
  socket.emit("room:create", { name: myName() });
};

$("joinBtn").onclick = () => {
  socket.emit("room:join", { name: myName(), code: $("roomCode").value });
};

$("startBtn").onclick = () => {
  socket.emit("game:start");
};

$("leaveGameBtn").onclick = () => {
  location.reload();
};

$("backLobbyBtn").onclick = () => {
  show("lobby");
  if (roomData) {
    renderRoom(roomData);
  }
};

socket.on("room:joined", data => {
  roomCode = data.code;
  playerId = data.playerId;
  isHost = data.host;

  $("homeError").textContent = "";
  $("roomCodeLabel").textContent = roomCode;
  $("bigCode").textContent = roomCode;

  show("lobby");
});

socket.on("error:message", msg => {
  $("homeError").textContent = msg;
});

socket.on("room:update", room => {
  roomData = room;
  renderRoom(room);
});

socket.on("room:closed", message => {
  running = false;
  clearInterval(questionTimer);
  moveHeld = false;
  activePointerId = null;
  $("homeError").textContent = message || "La sala se ha cerrado.";
  show("home");
});

function renderRoom(room) {
  $("roomCodeLabel").textContent = room.code;
  $("bigCode").textContent = room.code;
  $("playerList").innerHTML = "";

  room.players.forEach(p => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="dot" style="background:${p.color}"></span>` + `${escapeHtml(p.name)} · ${p.score} pts`;
    $("playerList").appendChild(li);
  });

  $("startBtn").classList.toggle("hidden", !isHost);
  $("startBtn").disabled = room.players.length < 2 || room.players.length > MAX_PLAYERS;

  $("lobbyHint").textContent =
    room.players.length < 2
      ? "Necesitas al menos 2 jugadores."
      : `Jugadores: ${room.players.length}/${MAX_PLAYERS}. ¡Listos para comenzar!`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// =====================================
// RONDAS Y ESTADOS
// =====================================

socket.on("game:round", data => {
  currentRound = data.round;
  obstacles = data.obstacles || [];
  bullets = [];
  currentQuestion = null;
  questionAnswered = false;
  clearInterval(questionTimer);
  moveHeld = false;
  activePointerId = null;
  lastStateSent = 0;
  $("aliveCount").textContent = `RONDA ${currentRound}/${TOTAL_ROUNDS}`;
});

socket.on("game:started", () => {
  clearInterval(questionTimer);
  moveHeld = false;
  activePointerId = null;
  bullets = [];
  running = true;
  lastTime = performance.now();
  lastStateSent = 0;
  show("gamePanel");
  requestAnimationFrame(loop);
});

socket.on("game:states", states => {
  players = states.map(incoming => {
    const existing = players.find(p => p.id === incoming.id);
    if (existing && incoming.id !== playerId) {
      // Suavizado lineal tanto para posición como para el ángulo de giro
      let angleDiff = incoming.angle - existing.angle;
      // Normalizar la diferencia de ángulo para evitar giros locos de 360 grados
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      return {
        ...incoming,
        x: existing.x + (incoming.x - existing.x) * 0.4,
        y: existing.y + (incoming.y - existing.y) * 0.4,
        angle: existing.angle + angleDiff * 0.4
      };
    }
    return incoming;
  });

  myTank = players.find(p => p.id === playerId) || null;

  if (myTank) {
    $("aliveCount").textContent =
      `RONDA ${currentRound}/${TOTAL_ROUNDS} · ${players.filter(p => p.alive).length} ALIVE`;
  }
});

  myTank = players.find(p => p.id === playerId) || null;

  if (myTank) {
    $("aliveCount").textContent =
      `RONDA ${currentRound}/${TOTAL_ROUNDS} · ${players.filter(p => p.alive).length} ALIVE`;
  }
});
}

socket.on("game:bullet", b => {
  bullets.push({ ...b, life: 2 });
});

// =====================================
// FINAL DE BATALLA Y PREGUNTAS
// =====================================

socket.on("game:finished", winner => {
  running = false;
  moveHeld = false;
  activePointerId = null;
  clearInterval(questionTimer);
  show("questionPanel");

  $("answers").innerHTML = "";
  $("questionFeedback").textContent = "";
  $("timer").textContent = "20";
  currentQuestion = null;
  questionAnswered = false;

  if (winner) {
    $("winnerTitle").textContent =
      winner.id === playerId ? "¡Ganaste la batalla! Es tu turno de responder." : "Ganador: " + winner.name;
    $("questionText").textContent =
      winner.id === playerId ? "Preparando tu pregunta..." : "Esperando la respuesta del ganador...";

    if (winner.id === playerId) {
      startQuestion();
    }
  } else {
    $("winnerTitle").textContent = "La batalla terminó sin ganador";
    $("questionText").textContent = "Nadie consiguió sobrevivir. Pasando a la siguiente ronda...";
  }
});

socket.on("question:display", question => {
  if (currentQuestion) return;
  clearInterval(questionTimer);
  $("questionText").textContent = question.q;
  $("answers").innerHTML = "";

  question.a.forEach((answer, i) => {
    const btn = document.createElement("button");
    btn.textContent = String.fromCharCode(65 + i) + ". " + answer;
    btn.disabled = true;
    $("answers").appendChild(btn);
  });

  let remaining = 20;
  $("timer").textContent = remaining;

  questionTimer = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    $("timer").textContent = remaining;
    if (remaining <= 0) clearInterval(questionTimer);
  }, 1000);
});

socket.on("question:closed", room => {
  clearInterval(questionTimer);
  roomData = room;
  renderScores(room);
  show("scorePanel");
});

socket.on("match:finished", ranking => {
  running = false;
  moveHeld = false;
  activePointerId = null;
  clearInterval(questionTimer);

  const list = $("scoreList");
  list.innerHTML = "";

  ranking.forEach((p, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${p.name} — ${p.score} puntos`;
    list.appendChild(li);
  });

  show("scorePanel");
  $("aliveCount").textContent = "PARTIDA FINALIZADA";
});

function renderScores(room) {
  const list = $("scoreList");
  list.innerHTML = "";
  [...room.players]
    .sort((a, b) => b.score - a.score)
    .forEach((p, index) => {
      const li = document.createElement("li");
      li.textContent = `${index + 1}. ${p.name} — ${p.score} puntos`;
      list.appendChild(li);
    });
}

function startQuestion() {
  currentQuestion = QUESTIONS[currentRound - 1];
  if (!currentQuestion) return;

  questionAnswered = false;
  questionStart = performance.now();
  socket.emit("question:show", currentQuestion);

  $("questionText").textContent = currentQuestion.q;
  $("answers").innerHTML = "";
  $("questionFeedback").textContent = "";

  currentQuestion.a.forEach((answer, i) => {
    const btn = document.createElement("button");
    btn.textContent = String.fromCharCode(65 + i) + ". " + answer;
    btn.onclick = () => answerQuestion(i, btn);
    $("answers").appendChild(btn);
  });

  let remaining = 20;
  $("timer").textContent = remaining;
  clearInterval(questionTimer);

  questionTimer = setInterval(() => {
    remaining--;
    $("timer").textContent = remaining;
    if (remaining <= 0) {
      clearInterval(questionTimer);
      answerQuestion(-1, null);
    }
  }, 1000);
}

function answerQuestion(index, button) {
  if (questionAnswered || !currentQuestion) return;
  questionAnswered = true;
  clearInterval(questionTimer);

  const elapsed = Math.min(20, (performance.now() - questionStart) / 1000);
  const correct = index === currentQuestion.correct;

  if (button) {
    button.classList.add(correct ? "correct" : "wrong");
  }

  [...$("answers").children].forEach((b, i) => {
    b.disabled = true;
    if (i === currentQuestion.correct) {
      b.classList.add("correct");
    }
  });

  $("questionFeedback").textContent = correct
    ? `¡Correcto! Tiempo: ${elapsed.toFixed(1)} s.`
    : "Respuesta incorrecta o tiempo agotado. 0 puntos.";

  socket.emit("question:result", { correct, elapsed });
}

// =====================================
// COLISIONES Y CONTROLES
// =====================================

function hitsObstacle(x, y, radius) {
  for (const o of obstacles) {
    if (!o) continue;
    const closestX = Math.max(o.x, Math.min(x, o.x + o.w));
    const closestY = Math.max(o.y, Math.min(y, o.y + o.h));
    const dx = x - closestX;
    const dy = y - closestY;
    if (dx * dx + dy * dy <= radius * radius) return true;
  }
  return false;
}

function pointerDown(e) {
  e.preventDefault();
  if (!running || !myTank || !myTank.alive || moveHeld) return;

  moveHeld = true;
  activePointerId = e.pointerId;
  moveAngle = myTank.angle;
  rotationDirection *= -1;

  socket.emit("player:shoot", {
    vx: Math.cos(moveAngle) * 360,
    vy: Math.sin(moveAngle) * 360
  });

  try { canvas.setPointerCapture(e.pointerId); } catch {}
}

function pointerUp(e) {
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  moveHeld = false;
  activePointerId = null;
}

canvas.addEventListener("pointerdown", pointerDown);
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("selectstart", e => e.preventDefault());
canvas.addEventListener("dragstart", e => e.preventDefault());
canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerUp);
canvas.addEventListener("lostpointercapture", pointerUp);

window.addEventListener("blur", () => { moveHeld = false; activePointerId = null; });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { moveHeld = false; activePointerId = null; }
});

// =====================================
// BUCLE PRINCIPAL
// =====================================

function loop(now) {
  if (!running) return;

  const dt = Math.min(MAX_FRAME_TIME, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  if (myTank && myTank.alive) {
    if (moveHeld) {
      myTank.angle = moveAngle;
      const nextX = myTank.x + Math.cos(moveAngle) * TANK_SPEED * dt;
      const nextY = myTank.y + Math.sin(moveAngle) * TANK_SPEED * dt;

      if (!hitsObstacle(nextX, nextY, TANK_RADIUS)) {
        myTank.x = nextX;
        myTank.y = nextY;
      }
    } else {
      myTank.angle += rotationDirection * ROTATION_SPEED * dt;
    }

    myTank.x = Math.max(24, Math.min(ARENA_WIDTH - 24, myTank.x));
    myTank.y = Math.max(24, Math.min(ARENA_HEIGHT - 24, myTank.y));

    if (now - lastStateSent >= STATE_SEND_INTERVAL) {
      socket.emit("player:state", {
        x: myTank.x,
        y: myTank.y,
        angle: myTank.angle,
        direction: rotationDirection
      });
      lastStateSent = now;
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (
      b.life <= 0 ||
      b.x <= 0 || b.x >= ARENA_WIDTH ||
      b.y <= 0 || b.y >= ARENA_HEIGHT ||
      hitsObstacle(b.x, b.y, 5)
    ) {
      bullets.splice(i, 1);
    }
  }

  draw();
  requestAnimationFrame(loop);
}

// =====================================
// RENDERIZADO
// =====================================

function drawObstacles() {
  for (const o of obstacles) {
    if (!o) continue;
    ctx.save();
    if (o.type === "crate") {
      ctx.fillStyle = "#9b6838";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "#e2ad69";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
      ctx.beginPath();
      ctx.moveTo(o.x + 5, o.y + 5); ctx.lineTo(o.x + o.w - 5, o.y + o.h - 5);
      ctx.moveTo(o.x + o.w - 5, o.y + 5); ctx.lineTo(o.x + 5, o.y + o.h - 5);
      ctx.stroke();
    } else if (o.type === "wall" || o.type === "barrier") {
      ctx.fillStyle = o.type === "wall" ? "#687887" : "#d0a34d";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "#293746";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    } else if (o.type === "barrel") {
      ctx.fillStyle = "#b64b32";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "#f2bd64";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 3, o.y + 3, o.w - 6, o.h - 6);
      ctx.beginPath();
      ctx.moveTo(o.x + 3, o.y + o.h / 2); ctx.lineTo(o.x + o.w - 3, o.y + o.h / 2);
      ctx.stroke();
    } else if (o.type === "water") {
      ctx.fillStyle = "#246b91";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = "#65c5e8";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.beginPath();
      ctx.moveTo(o.x + 12, o.y + o.h / 2); ctx.lineTo(o.x + o.w - 12, o.y + o.h / 2);
      ctx.stroke();
    } else if (o.type === "rock") {
      ctx.fillStyle = "#778078";
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b6c0b5";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function draw() {
  ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  ctx.fillStyle = "#101a25";
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  ctx.strokeStyle = "#1c2b3b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < ARENA_WIDTH; x += 40) {
    ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_HEIGHT);
  }
  for (let y = 0; y < ARENA_HEIGHT; y += 40) {
    ctx.moveTo(0, y); ctx.lineTo(ARENA_WIDTH, y);
  }
  ctx.stroke();

  drawObstacles();

  for (const b of bullets) {
    ctx.fillStyle = b.color || "#ffffff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of players) {
    if (!p.alive) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    ctx.fillStyle = p.color;
    ctx.fillRect(-13, -10, 26, 20);
    ctx.fillRect(4, -3, 20, 6);

    ctx.fillStyle = "#0b1018";
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#eaf0f6";
    ctx.font = "12px Inter";
    ctx.textAlign = "center";
    ctx.fillText(p.name, p.x, p.y - 20);
  }
}
