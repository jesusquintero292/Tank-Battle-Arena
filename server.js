
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000
});

app.use(express.static(path.join(__dirname, "public")));

// =====================================
// CONFIGURACIÓN
// =====================================

const rooms = new Map();

const MAX_PLAYERS = 8;
const TOTAL_ROUNDS = 6;

const WIDTH = 1200;
const HEIGHT = 750;

const TICK_RATE = 30;
const STATE_INTERVAL = 50;

const BULLET_RADIUS = 5;
const TANK_RADIUS = 17;

const PLAYER_STATE_MIN_INTERVAL = 35;

// =====================================
// MAPAS DE LAS SEIS RONDAS
// =====================================

const ROUND_OBSTACLES = [
  [
    { x: 270, y: 145, w: 65, h: 65, type: "crate" },
    { x: 865, y: 145, w: 65, h: 65, type: "crate" },
    { x: 270, y: 540, w: 65, h: 65, type: "crate" },
    { x: 865, y: 540, w: 65, h: 65, type: "crate" },
    { x: 555, y: 320, w: 65, h: 65, type: "crate" },
    { x: 650, y: 320, w: 65, h: 65, type: "crate" }
  ],
  [
    { x: 250, y: 100, w: 30, h: 220, type: "wall" },
    { x: 250, y: 430, w: 30, h: 220, type: "wall" },
    { x: 450, y: 0, w: 30, h: 220, type: "wall" },
    { x: 450, y: 350, w: 30, h: 220, type: "wall" },
    { x: 720, y: 180, w: 30, h: 220, type: "wall" },
    { x: 720, y: 530, w: 30, h: 220, type: "wall" },
    { x: 950, y: 100, w: 30, h: 220, type: "wall" },
    { x: 950, y: 430, w: 30, h: 220, type: "wall" }
  ],
  [
    { x: 240, y: 170, w: 45, h: 45, type: "barrel" },
    { x: 430, y: 115, w: 45, h: 45, type: "barrel" },
    { x: 620, y: 170, w: 45, h: 45, type: "barrel" },
    { x: 810, y: 115, w: 45, h: 45, type: "barrel" },
    { x: 1000, y: 170, w: 45, h: 45, type: "barrel" },
    { x: 240, y: 520, w: 45, h: 45, type: "barrel" },
    { x: 430, y: 575, w: 45, h: 45, type: "barrel" },
    { x: 620, y: 520, w: 45, h: 45, type: "barrel" },
    { x: 810, y: 575, w: 45, h: 45, type: "barrel" },
    { x: 1000, y: 520, w: 45, h: 45, type: "barrel" }
  ],
  [
    { x: 230, y: 170, w: 130, h: 85, type: "water" },
    { x: 510, y: 100, w: 100, h: 75, type: "rock" },
    { x: 850, y: 170, w: 130, h: 85, type: "water" },
    { x: 230, y: 500, w: 130, h: 85, type: "rock" },
    { x: 510, y: 570, w: 100, h: 75, type: "water" },
    { x: 850, y: 500, w: 130, h: 85, type: "rock" },
    { x: 555, y: 320, w: 90, h: 90, type: "rock" }
  ],
  [
    { x: 160, y: 150, w: 300, h: 30, type: "barrier" },
    { x: 740, y: 150, w: 300, h: 30, type: "barrier" },
    { x: 160, y: 570, w: 300, h: 30, type: "barrier" },
    { x: 740, y: 570, w: 300, h: 30, type: "barrier" },
    { x: 560, y: 180, w: 35, h: 180, type: "wall" },
    { x: 650, y: 390, w: 35, h: 180, type: "wall" },
    { x: 370, y: 320, w: 100, h: 35, type: "barrier" },
    { x: 730, y: 320, w: 100, h: 35, type: "barrier" }
  ],
  [
    { x: 250, y: 150, w: 65, h: 65, type: "crate" },
    { x: 885, y: 150, w: 65, h: 65, type: "crate" },
    { x: 250, y: 535, w: 65, h: 65, type: "crate" },
    { x: 885, y: 535, w: 65, h: 65, type: "crate" },
    { x: 550, y: 130, w: 65, h: 45, type: "barrel" },
    { x: 650, y: 130, w: 65, h: 45, type: "barrel" },
    { x: 550, y: 575, w: 65, h: 45, type: "barrel" },
    { x: 650, y: 575, w: 65, h: 45, type: "barrel" },
    { x: 420, y: 300, w: 35, h: 150, type: "wall" },
    { x: 745, y: 300, w: 35, h: 150, type: "wall" }
  ]
];

// =====================================
// UTILIDADES
// =====================================

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = Array.from({ length: 5 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));

  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    hostName: room.hostName,
    status: room.status,
    round: room.round,
    spectators: 1,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      score: p.score,
      alive: p.alive
    }))
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function emitStates(room) {
  io.to(room.code).emit(
    "game:states",
    [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      angle: p.angle,
      alive: p.alive
    }))
  );

  room.stateDirty = false;
}

function markStatesDirty(room) {
  room.stateDirty = true;
}

// =====================================
// COLISIONES
// =====================================

function circleHitsRect(x, y, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));

  const dx = x - closestX;
  const dy = y - closestY;

  return dx * dx + dy * dy <= radius * radius;
}

function blocked(room, x, y, radius) {
  for (const obstacle of room.obstacles) {
    if (circleHitsRect(x, y, radius, obstacle)) {
      return true;
    }
  }

  return false;
}

function segmentHitsRect(x1, y1, x2, y2, rect, radius) {
  const minX = rect.x - radius;
  const maxX = rect.x + rect.w + radius;
  const minY = rect.y - radius;
  const maxY = rect.y + rect.h + radius;

  const dx = x2 - x1;
  const dy = y2 - y1;

  let tMin = 0;
  let tMax = 1;

  const tests = [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dy, y1 - minY],
    [dy, maxY - y1]
  ];

  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }

    const t = q / p;

    if (p < 0) {
      tMin = Math.max(tMin, t);
    } else {
      tMax = Math.min(tMax, t);
    }

    if (tMin > tMax) return false;
  }

  return true;
}

function pointSegmentDistanceSquared(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    const ox = px - x1;
    const oy = py - y1;
    return ox * ox + oy * oy;
  }

  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)
  );

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  const ox = px - closestX;
  const oy = py - closestY;

  return ox * ox + oy * oy;
}

// =====================================
// FINALIZAR RONDA
// =====================================

function finishRound(room) {
  if (room.status !== "playing") return;

  const alive = [...room.players.values()].filter(p => p.alive);

  if (alive.length > 1) return;

  room.status = "question";
  room.bullets.length = 0;

  room.winnerId = alive.length === 1 ? alive[0].id : null;

  io.to(room.code).emit(
    "game:finished",
    alive.length === 1
      ? { id: alive[0].id, name: alive[0].name }
      : null
  );

  emitStates(room);
  emitRoom(room);

  if (alive.length === 0) {
    room.status = "transition";

    setTimeout(() => {
      if (!rooms.has(room.code) || room.status !== "transition") return;

      room.round += 1;
      startRound(room);
    }, 3000);
  }
}

// =====================================
// INICIAR RONDA
// =====================================

function startRound(room) {
  if (room.round > TOTAL_ROUNDS) {
    room.status = "finished";

    const ranking = [...room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map(p => ({
        id: p.id,
        name: p.name,
        score: p.score
      }));

    io.to(room.code).emit("match:finished", ranking);
    emitRoom(room);
    return;
  }

  room.status = "playing";
  room.winnerId = null;
  room.bullets.length = 0;

  room.obstacles = ROUND_OBSTACLES[room.round - 1].map(o => ({ ...o }));

  const positions = [
    { x: 75, y: 75 },
    { x: 1125, y: 675 },
    { x: 1125, y: 75 },
    { x: 75, y: 675 },
    { x: 600, y: 65 },
    { x: 600, y: 685 },
    { x: 65, y: 375 },
    { x: 1135, y: 375 }
  ];

  [...room.players.values()].forEach((p, i) => {
    const position = positions[i];

    p.alive = true;
    p.x = position.x;
    p.y = position.y;

    p.angle = Math.atan2(
      HEIGHT / 2 - p.y,
      WIDTH / 2 - p.x
    );

    p.lastStateAt = 0;
  });

  io.to(room.code).emit("game:round", {
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    obstacles: room.obstacles
  });

  io.to(room.code).emit("game:started");

  emitStates(room);
  emitRoom(room);
}

// =====================================
// CONEXIONES
// =====================================

io.on("connection", socket => {
  console.log("Usuario conectado:", socket.id);

  // CREAR SALA: ADMINISTRADOR ESPECTADOR

  socket.on("room:create", ({ name } = {}) => {
    const cleanName =
      String(name || "Administrador").trim().slice(0, 16) || "Administrador";

    const code = makeCode();

    const room = {
      code,
      hostId: socket.id,
      hostName: cleanName,
      status: "lobby",
      round: 1,
      winnerId: null,
      players: new Map(),
      bullets: [],
      obstacles: [],
      stateDirty: false,
      colors: [
        "#42d392",
        "#54a6ff",
        "#ffca58",
        "#ff6b6b",
        "#b78cff",
        "#ff8ac7",
        "#8bd3dd",
        "#d5e56b"
      ]
    };

    rooms.set(code, room);

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;

    socket.emit("room:joined", {
      code,
      host: true,
      playerId: socket.id,
      spectator: true
    });

    emitRoom(room);
  });

  // UNIRSE COMO JUGADOR

  socket.on("room:join", ({ code, name } = {}) => {
    const normalized = String(code || "").trim().toUpperCase();
    const room = rooms.get(normalized);

    if (!room) {
      return socket.emit("error:message", "No existe esa sala.");
    }

    if (room.status !== "lobby") {
      return socket.emit("error:message", "La partida ya comenzó.");
    }

    if (room.players.size >= MAX_PLAYERS) {
      return socket.emit("error:message", "La sala está llena.");
    }

    const cleanName =
      String(name || "Jugador").trim().slice(0, 16) || "Jugador";

    const index = room.players.size;

    room.players.set(socket.id, {
      id: socket.id,
      name: cleanName,
      color: room.colors[index],
      x: 600,
      y: 375,
      angle: Math.random() * Math.PI * 2,
      alive: true,
      score: 0,
      lastStateAt: 0
    });

    socket.join(normalized);
    socket.data.roomCode = normalized;
    socket.data.isHost = false;

    socket.emit("room:joined", {
      code: normalized,
      host: false,
      playerId: socket.id,
      spectator: false
    });

    emitRoom(room);
  });

  // INICIAR PARTIDA

  socket.on("game:start", () => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.hostId !== socket.id) return;

    if (
      (room.status !== "lobby" && room.status !== "finished") ||
      room.players.size < 2 ||
      room.players.size > MAX_PLAYERS
    ) {
      return;
    }

    room.round = 1;

    for (const player of room.players.values()) {
      player.score = 0;
    }

    startRound(room);
  });

  // MOVIMIENTO: RECIBIR POSICIONES SIN EMITIR INMEDIATAMENTE

  socket.on("player:state", state => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "playing" || !state) return;

    const player = room.players.get(socket.id);

    if (!player || !player.alive) return;

    const now = Date.now();

    if (now - player.lastStateAt < PLAYER_STATE_MIN_INTERVAL) {
      return;
    }

    player.lastStateAt = now;

    const rawX = Number(state.x);
    const rawY = Number(state.y);
    const rawAngle = Number(state.angle);

    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;

    const x = Math.max(
      TANK_RADIUS + 7,
      Math.min(WIDTH - TANK_RADIUS - 7, rawX)
    );

    const y = Math.max(
      TANK_RADIUS + 7,
      Math.min(HEIGHT - TANK_RADIUS - 7, rawY)
    );

    if (!blocked(room, x, y, TANK_RADIUS)) {
      player.x = x;
      player.y = y;
    }

    if (Number.isFinite(rawAngle)) {
      player.angle = rawAngle;
    }

    markStatesDirty(room);
  });

  // DISPARAR

  socket.on("player:shoot", bullet => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "playing" || !bullet) return;

    const player = room.players.get(socket.id);

    if (!player || !player.alive) return;

    const vx = Number(bullet.vx);
    const vy = Number(bullet.vy);

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) return;

    const speed = Math.hypot(vx, vy);

    if (speed < 100 || speed > 600) return;

    const dx = vx / speed;
    const dy = vy / speed;

    const newBullet = {
      owner: socket.id,
      x: player.x + dx * 22,
      y: player.y + dy * 22,
      vx,
      vy,
      color: player.color,
      life: 2
    };

    if (blocked(room, newBullet.x, newBullet.y, BULLET_RADIUS)) {
      return;
    }

    room.bullets.push(newBullet);

    io.to(room.code).emit("game:bullet", {
      owner: newBullet.owner,
      x: newBullet.x,
      y: newBullet.y,
      vx: newBullet.vx,
      vy: newBullet.vy,
      color: newBullet.color
    });
  });

  // MOSTRAR PREGUNTA

  socket.on("question:show", question => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "question") return;
    if (room.winnerId !== socket.id || !question) return;

    io.to(room.code).emit("question:display", {
      q: String(question.q || ""),
      a: Array.isArray(question.a)
        ? question.a.slice(0, 4).map(x => String(x))
        : []
    });
  });

  // RESULTADO DE LA PREGUNTA

  socket.on("question:result", ({ correct, elapsed } = {}) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "question") return;
    if (room.winnerId !== socket.id) return;

    const winner = room.players.get(room.winnerId);

    if (winner && correct) {
      const seconds = Math.max(
        0,
        Math.min(20, Number(elapsed) || 20)
      );

      const points = Math.max(
        0,
        Math.round(100 * (20 - seconds) / 20)
      );

      winner.score += points;
    }

    room.status = "transition";
    room.winnerId = null;

    io.to(room.code).emit("question:closed", publicRoom(room));
    emitRoom(room);

    setTimeout(() => {
      if (!rooms.has(room.code) || room.status !== "transition") return;

      room.round += 1;
      startRound(room);
    }, 3000);
  });

  // DESCONECTAR

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);

    const code = socket.data.roomCode;
    const room = rooms.get(code);

    if (!room) return;

    if (room.hostId === socket.id) {
      io.to(room.code).emit(
        "room:closed",
        "El administrador se ha desconectado."
      );

      rooms.delete(code);
      return;
    }

    room.players.delete(socket.id);

    room.bullets = room.bullets.filter(
      bullet => bullet.owner !== socket.id
    );

    if (
      room.status === "question" &&
      room.winnerId === socket.id
    ) {
      room.status = "transition";
      room.winnerId = null;

      io.to(room.code).emit("question:closed", publicRoom(room));

      setTimeout(() => {
        if (!rooms.has(room.code) || room.status !== "transition") return;

        room.round += 1;
        startRound(room);
      }, 3000);
    }

    emitRoom(room);

    if (room.status === "playing") {
      markStatesDirty(room);
      finishRound(room);
    }
  });
});

// =====================================
// ENVÍO AGRUPADO DE ESTADOS
// =====================================

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status !== "playing" || !room.stateDirty) continue;
    emitStates(room);
  }
}, STATE_INTERVAL);

// =====================================
// MOVIMIENTO DE BALAS Y COLISIONES
// =====================================

const bulletStep = TICK_RATE / 1000;
const hitDistanceSquared =
  (TANK_RADIUS + BULLET_RADIUS) ** 2;

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status !== "playing" || room.bullets.length === 0) continue;

    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const bullet = room.bullets[i];

      if (!bullet) {
        room.bullets.splice(i, 1);
        continue;
      }

      const oldX = bullet.x;
      const oldY = bullet.y;

      const newX = oldX + bullet.vx * bulletStep;
      const newY = oldY + bullet.vy * bulletStep;

      bullet.life -= bulletStep;

      let removeBullet = false;
      let playerHit = false;

      // Obstáculos

      for (const obstacle of room.obstacles) {
        if (
          segmentHitsRect(
            oldX,
            oldY,
            newX,
            newY,
            obstacle,
            BULLET_RADIUS
          )
        ) {
          removeBullet = true;
          break;
        }
      }

      // Tanques

      if (!removeBullet) {
        for (const target of room.players.values()) {
          if (
            !target.alive ||
            target.id === bullet.owner
          ) {
            continue;
          }

          const distanceSquared = pointSegmentDistanceSquared(
            target.x,
            target.y,
            oldX,
            oldY,
            newX,
            newY
          );

          if (distanceSquared <= hitDistanceSquared) {
            target.alive = false;
            removeBullet = true;
            playerHit = true;
            markStatesDirty(room);
            break;
          }
        }
      }

      if (!removeBullet) {
        bullet.x = newX;
        bullet.y = newY;
      }

      if (
        removeBullet ||
        bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > WIDTH ||
        bullet.y < 0 ||
        bullet.y > HEIGHT
      ) {
        room.bullets.splice(i, 1);
      }

      if (playerHit) {
        emitRoom(room);
        finishRound(room);

        if (room.status !== "playing") break;
      }
    }
  }
}, TICK_RATE);

// =====================================
// INICIAR SERVIDOR
// =====================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tank Battle listo en el puerto ${PORT}`);
});
