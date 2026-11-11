
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
const BULLET_RADIUS = 5;
const TANK_RADIUS = 17;

// =====================================
// MAPAS DE LAS SEIS RONDAS
// =====================================

const ROUND_OBSTACLES = [

  // RONDA 1: CAMPO DE CAJAS
  [
    { x: 270, y: 145, w: 65, h: 65, type: "crate" },
    { x: 865, y: 145, w: 65, h: 65, type: "crate" },
    { x: 270, y: 540, w: 65, h: 65, type: "crate" },
    { x: 865, y: 540, w: 65, h: 65, type: "crate" },
    { x: 555, y: 320, w: 65, h: 65, type: "crate" },
    { x: 650, y: 320, w: 65, h: 65, type: "crate" }
  ],

  // RONDA 2: LABERINTO DE MUROS
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

  // RONDA 3: CAMPO DE BARRILES
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

  // RONDA 4: ROCAS Y LAGUNAS
  [
    { x: 230, y: 170, w: 130, h: 85, type: "water" },
    { x: 510, y: 100, w: 100, h: 75, type: "rock" },
    { x: 850, y: 170, w: 130, h: 85, type: "water" },
    { x: 230, y: 500, w: 130, h: 85, type: "rock" },
    { x: 510, y: 570, w: 100, h: 75, type: "water" },
    { x: 850, y: 500, w: 130, h: 85, type: "rock" },
    { x: 555, y: 320, w: 90, h: 90, type: "rock" }
  ],

  // RONDA 5: PASILLOS Y BARRERAS
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

  // RONDA 6: BATALLA FINAL
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
// CREAR CÓDIGOS DE SALA
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

// =====================================
// INFORMACIÓN PÚBLICA
// =====================================

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
}

// =====================================
// COLISIONES
// =====================================

function circleHitsRect(x, y, radius, rect) {
  if (
    !rect ||
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.w) ||
    !Number.isFinite(rect.h)
  ) {
    return false;
  }

  const closestX = Math.max(
    rect.x,
    Math.min(x, rect.x + rect.w)
  );

  const closestY = Math.max(
    rect.y,
    Math.min(y, rect.y + rect.h)
  );

  return Math.hypot(
    x - closestX,
    y - closestY
  ) <= radius;
}

function blocked(room, x, y, radius) {
  return room.obstacles.some(obstacle =>
    circleHitsRect(x, y, radius, obstacle)
  );
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

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((px - x1) * dx + (py - y1) * dy) / lengthSquared
    )
  );

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return Math.hypot(
    px - closestX,
    py - closestY
  );
}

// =====================================
// FINALIZAR RONDA
// =====================================

function finishRound(room) {
  if (room.status !== "playing") return;

  const alive = [...room.players.values()].filter(p => p.alive);

  if (alive.length > 1) return;

  room.status = "question";
  room.bullets = [];

  room.winnerId = alive.length === 1
    ? alive[0].id
    : null;

  io.to(room.code).emit(
    "game:finished",
    alive.length === 1
      ? {
          id: alive[0].id,
          name: alive[0].name
        }
      : null
  );

  emitRoom(room);

  if (alive.length === 0) {
    room.status = "transition";

    setTimeout(() => {
      if (
        !rooms.has(room.code) ||
        room.status !== "transition"
      ) return;

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
  room.bullets = [];

  room.obstacles = ROUND_OBSTACLES[
    room.round - 1
  ].map(o => ({ ...o }));

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
    p.alive = true;

    const position = positions[i];

    p.x = position.x;
    p.y = position.y;

    p.angle = Math.atan2(
      HEIGHT / 2 - p.y,
      WIDTH / 2 - p.x
    );
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

  // -----------------------------------
  // CREAR SALA COMO ADMINISTRADOR
  // -----------------------------------

  socket.on("room:create", ({ name }) => {
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

      // El administrador NO se agrega a players.
      players: new Map(),

      bullets: [],
      obstacles: [],

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

  // -----------------------------------
  // UNIRSE A UNA SALA COMO JUGADOR
  // -----------------------------------

  socket.on("room:join", ({ code, name }) => {
    const normalized =
      String(code || "").trim().toUpperCase();

    const room = rooms.get(normalized);

    if (!room) {
      return socket.emit(
        "error:message",
        "No existe esa sala."
      );
    }

    if (room.status !== "lobby") {
      return socket.emit(
        "error:message",
        "La partida ya comenzó."
      );
    }

    if (room.players.size >= MAX_PLAYERS) {
      return socket.emit(
        "error:message",
        "La sala está llena."
      );
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
      score: 0
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

  // -----------------------------------
  // INICIAR PARTIDA
  // -----------------------------------

  socket.on("game:start", () => {
    const room = rooms.get(socket.data.roomCode);

    // Solo el administrador puede iniciar.
    if (!room || room.hostId !== socket.id) return;

    if (
      (room.status !== "lobby" &&
       room.status !== "finished") ||
      room.players.size < 2 ||
      room.players.size > MAX_PLAYERS
    ) {
      return;
    }

    room.round = 1;

    for (const p of room.players.values()) {
      p.score = 0;
    }

    startRound(room);
  });

  // -----------------------------------
  // MOVIMIENTO DE JUGADORES
  // -----------------------------------

  socket.on("player:state", state => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "playing") return;

    const player = room.players.get(socket.id);

    // El administrador no tiene tanque.
    if (!player || !player.alive) return;

    const x = Math.max(
      TANK_RADIUS + 7,
      Math.min(
        WIDTH - TANK_RADIUS - 7,
        Number(state.x) || player.x
      )
    );

    const y = Math.max(
      TANK_RADIUS + 7,
      Math.min(
        HEIGHT - TANK_RADIUS - 7,
        Number(state.y) || player.y
      )
    );

    if (!blocked(room, x, y, TANK_RADIUS)) {
      player.x = x;
      player.y = y;
    }

    if (Number.isFinite(Number(state.angle))) {
      player.angle = Number(state.angle);
    }

    emitStates(room);
  });

  // -----------------------------------
  // DISPARAR
  // -----------------------------------

  socket.on("player:shoot", bullet => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "playing") return;

    const player = room.players.get(socket.id);

    if (!player || !player.alive) return;

    const vx = Number(bullet.vx);
    const vy = Number(bullet.vy);

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      return;
    }

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

    if (
      room.obstacles.some(o =>
        circleHitsRect(
          newBullet.x,
          newBullet.y,
          BULLET_RADIUS,
          o
        )
      )
    ) {
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

  // -----------------------------------
  // MOSTRAR PREGUNTA
  // -----------------------------------

  socket.on("question:show", question => {
    const room = rooms.get(socket.data.roomCode);

    if (!room || room.status !== "question") return;
    if (room.winnerId !== socket.id) return;

    io.to(room.code).emit("question:display", {
      q: String(question.q || ""),

      a: Array.isArray(question.a)
        ? question.a.slice(0, 4).map(x => String(x))
        : []
    });
  });

  // -----------------------------------
  // RESULTADO DE LA PREGUNTA
  // -----------------------------------

  socket.on("question:result", ({ correct, elapsed }) => {
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

    io.to(room.code).emit(
      "question:closed",
      publicRoom(room)
    );

    emitRoom(room);

    setTimeout(() => {
      if (
        !rooms.has(room.code) ||
        room.status !== "transition"
      ) return;

      room.round += 1;

      startRound(room);
    }, 3000);
  });

  // -----------------------------------
  // DESCONECTAR JUGADOR O ADMINISTRADOR
  // -----------------------------------

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);

    const code = socket.data.roomCode;
    const room = rooms.get(code);

    if (!room) return;

    // Si se desconecta el administrador,
    // cerrar la sala para no dejarla sin control.
    if (room.hostId === socket.id) {
      io.to(room.code).emit(
        "room:closed",
        "El administrador se ha desconectado."
      );

      rooms.delete(code);
      return;
    }

    // Eliminar al jugador desconectado.
    room.players.delete(socket.id);

    room.bullets = room.bullets.filter(
      b => b.owner !== socket.id
    );

    // Si se desconecta el ganador mientras debe responder,
    // avanzar a la siguiente ronda.
    if (
      room.status === "question" &&
      room.winnerId === socket.id
    ) {
      room.status = "transition";
      room.winnerId = null;

      io.to(room.code).emit(
        "question:closed",
        publicRoom(room)
      );

      setTimeout(() => {
        if (
          !rooms.has(room.code) ||
          room.status !== "transition"
        ) return;

        room.round += 1;
        startRound(room);
      }, 3000);
    }

    emitRoom(room);

    if (room.status === "playing") {
      emitStates(room);
      finishRound(room);
    }

    // Si no queda ningún jugador, conservar la sala
    // mientras el administrador siga conectado.
  });
});

// =====================================
// MOVIMIENTO DE BALAS Y COLISIONES
// =====================================

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status !== "playing") continue;

    for (let i = room.bullets.length - 1; i >= 0; i--) {
      const bullet = room.bullets[i];

      if (!bullet) {
        room.bullets.splice(i, 1);
        continue;
      }

      const oldX = bullet.x;
      const oldY = bullet.y;

      const newX = oldX + bullet.vx * (TICK_RATE / 1000);
      const newY = oldY + bullet.vy * (TICK_RATE / 1000);

      bullet.life -= TICK_RATE / 1000;

      let removeBullet = false;
      let playerHit = false;

      // 1. Comprobar obstáculos.
      const hitObstacle = room.obstacles.some(o =>
        segmentHitsRect(
          oldX,
          oldY,
          newX,
          newY,
          o,
          BULLET_RADIUS
        )
      );

      if (hitObstacle) {
        removeBullet = true;
      }

      // 2. Comprobar tanques.
      if (!removeBullet) {
        for (const target of room.players.values()) {
          if (
            !target ||
            !target.alive ||
            target.id === bullet.owner
          ) {
            continue;
          }

          const distance = pointSegmentDistance(
            target.x,
            target.y,
            oldX,
            oldY,
            newX,
            newY
          );

          if (distance <= TANK_RADIUS + BULLET_RADIUS) {
            target.alive = false;

            removeBullet = true;
            playerHit = true;

            emitStates(room);
            emitRoom(room);

            break;
          }
        }
      }

      // 3. Actualizar posición de la bala.
      if (!removeBullet) {
        bullet.x = newX;
        bullet.y = newY;
      }

      // 4. Eliminar balas agotadas o fuera del mapa.
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

      // 5. Comprobar si terminó la ronda.
      if (playerHit) {
        finishRound(room);

        if (room.status !== "playing") {
          break;
        }
      }
    }
  }
}, TICK_RATE);

// =====================================
// INICIAR SERVIDOR
// =====================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `Tank Battle listo en http://localhost:${PORT}`
  );
});
