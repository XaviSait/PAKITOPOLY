const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Global rooms state
const rooms = {};
// Global auction timers (stored by roomId to avoid serializing non-serializable Timeout objects)
const auctionTimers = {};
// Global disconnect timers for player reconnection (stored by player username + roomId)
const disconnectTimers = {};

// Board Data
const BOARD_DATA = [
  { id: 0, name: "Salida", type: "go", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 1, name: "Melón", type: "property", color: "brown", price: 60, rentProgress: [2, 10, 30, 90, 160, 250], housePrice: 50, houses: 0, owner: null, mortgaged: false },
  { id: 2, name: "Caja de Comunidad", type: "community", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 3, name: "Ribadeo", type: "property", color: "brown", price: 60, rentProgress: [4, 20, 60, 180, 320, 450], housePrice: 50, houses: 0, owner: null, mortgaged: false },
  { id: 4, name: "Impuesto sobre el capital", type: "tax", price: null, cost: 200, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 5, name: "Blablacar", type: "transport", price: 200, rentProgress: [25, 50, 100, 200], housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 6, name: "Santiago", type: "property", color: "lightblue", price: 100, rentProgress: [6, 30, 90, 270, 400, 550], housePrice: 50, houses: 0, owner: null, mortgaged: false },
  { id: 7, name: "Suerte", type: "suerte", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 8, name: "Coruña", type: "property", color: "lightblue", price: 100, rentProgress: [6, 30, 90, 270, 400, 550], housePrice: 50, houses: 0, owner: null, mortgaged: false },
  { id: 9, name: "Vigo", type: "property", color: "lightblue", price: 120, rentProgress: [8, 40, 100, 300, 450, 600], housePrice: 50, houses: 0, owner: null, mortgaged: false },
  { id: 10, name: "Cárcel (Solo visitas)", type: "jail", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 11, name: "Alicante", type: "property", color: "pink", price: 140, rentProgress: [10, 50, 150, 450, 625, 750], housePrice: 100, houses: 0, owner: null, mortgaged: false },
  { id: 12, name: "Discord", type: "service", price: 150, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 13, name: "Elche", type: "property", color: "pink", price: 140, rentProgress: [10, 50, 150, 450, 625, 750], housePrice: 100, houses: 0, owner: null, mortgaged: false },
  { id: 14, name: "Altea", type: "property", color: "pink", price: 160, rentProgress: [12, 60, 180, 500, 700, 900], housePrice: 100, houses: 0, owner: null, mortgaged: false },
  { id: 15, name: "Barco", type: "transport", price: 200, rentProgress: [25, 50, 100, 200], housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 16, name: "Tabarca", type: "property", color: "orange", price: 180, rentProgress: [14, 70, 200, 550, 750, 950], housePrice: 100, houses: 0, owner: null, mortgaged: false },
  { id: 17, name: "Caja de Comunidad", type: "community", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 18, name: "Mallorca", type: "property", color: "orange", price: 180, rentProgress: [14, 70, 200, 550, 750, 950], housePrice: 100, houses: 0, owner: null, mortgaged: false },
  { id: 19, name: "Ibiza", type: "property", color: "orange", price: 200, rentProgress: [16, 80, 220, 600, 800, 1000], housePrice: 100, houses: 0, owner: null, mortgaged: false },
  { id: 20, name: "Parking Gratuito", type: "parking", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 21, name: "Almería", type: "property", color: "red", price: 220, rentProgress: [18, 90, 250, 700, 875, 1050], housePrice: 150, houses: 0, owner: null, mortgaged: false },
  { id: 22, name: "Suerte", type: "suerte", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 23, name: "Granada", type: "property", color: "red", price: 220, rentProgress: [18, 90, 250, 700, 875, 1050], housePrice: 150, houses: 0, owner: null, mortgaged: false },
  { id: 24, name: "Sevilla", type: "property", color: "red", price: 240, rentProgress: [20, 100, 300, 750, 925, 1100], housePrice: 150, houses: 0, owner: null, mortgaged: false },
  { id: 25, name: "AVE", type: "transport", price: 200, rentProgress: [25, 50, 100, 200], housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 26, name: "Cádiz", type: "property", color: "yellow", price: 260, rentProgress: [22, 110, 330, 800, 975, 1150], housePrice: 150, houses: 0, owner: null, mortgaged: false },
  { id: 27, name: "Málaga", type: "property", color: "yellow", price: 260, rentProgress: [22, 110, 330, 800, 975, 1150], housePrice: 150, houses: 0, owner: null, mortgaged: false },
  { id: 28, name: "Glovo", type: "service", price: 150, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 29, name: "Marbella", type: "property", color: "yellow", price: 280, rentProgress: [24, 120, 360, 850, 1025, 1200], housePrice: 150, houses: 0, owner: null, mortgaged: false },
  { id: 30, name: "Ir a la Cárcel", type: "gotojail", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 31, name: "Cadaqués", type: "property", color: "green", price: 300, rentProgress: [26, 130, 390, 900, 1100, 1275], housePrice: 200, houses: 0, owner: null, mortgaged: false },
  { id: 32, name: "Castelldefels", type: "property", color: "green", price: 300, rentProgress: [26, 130, 390, 900, 1100, 1275], housePrice: 200, houses: 0, owner: null, mortgaged: false },
  { id: 33, name: "Caja de Comunidad", type: "community", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 34, name: "Andorra", type: "property", color: "green", price: 320, rentProgress: [28, 150, 450, 1000, 1200, 1400], housePrice: 200, houses: 0, owner: null, mortgaged: false },
  { id: 35, name: "Avión", type: "transport", price: 200, rentProgress: [25, 50, 100, 200], housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 36, name: "Suerte", type: "suerte", price: null, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 37, name: "Barcelona", type: "property", color: "darkblue", price: 350, rentProgress: [35, 175, 500, 1100, 1300, 1500], housePrice: 200, houses: 0, owner: null, mortgaged: false },
  { id: 38, name: "Impuesto de lujo", type: "tax", price: null, cost: 100, rentProgress: null, housePrice: null, houses: 0, owner: null, mortgaged: false },
  { id: 39, name: "Madrid", type: "property", color: "darkblue", price: 400, rentProgress: [50, 200, 600, 1400, 1700, 2000], housePrice: 200, houses: 0, owner: null, mortgaged: false }
];

// Cards definitions
const COMMUNITY_CARDS = [
  { text: "Error crítico en el hosting. El servidor de Minecraft se ha caído y toca pagar el mantenimiento. Paga 50M.", type: "pay", amount: 50 },
  { text: "Diseñas un banner espectacular para un canal de Twitch. El streamer te hace el ingreso. Cobra 150M.", type: "receive", amount: 150 },
  { text: "Pides un Glovo de madrugada para todo el grupo y te toca adelantar el dinero a ti. Paga 100M.", type: "pay", amount: 100 },
  { text: "Te pillan muteado en el Discord y te tiran del canal. Ve directamente a la Cárcel sin pasar por Salida.", type: "jail" },
  { text: "Día de fútbol. Tocó poner bote para las banderas y bufandas de la peña en la grada. Paga 50M.", type: "pay", amount: 50 },
  { text: "Un error del banco a tu favor te ingresa la beca antes de tiempo. Cobra 200M.", type: "receive", amount: 200 },
  { text: "Haces directo benéfico de 24 horas y tu comunidad revienta el botón de donar. Cobra 100M.", type: "receive", amount: 100 },
  { text: "Te compras un teclado mecánico custom super ruidoso y te pasas de presupuesto. Paga 50M.", type: "pay", amount: 50 },
  { text: "Heredas un disco duro antiguo con un pequeño trozo de Bitcoin. Cobra 200M.", type: "receive", amount: 200 },
  { text: "Te toca pagar la suscripción anual de Netflix, Spotify, Prime y Disney+. Paga 80M.", type: "pay", amount: 80 },
  { text: "Haces una colaboración patrocinada con una marca de bebidas energéticas. Cobra 120M.", type: "receive", amount: 120 },
  { text: "Te pillan descargando torrents sin VPN y te llega una multa de tu proveedor de internet. Paga 30M.", type: "pay", amount: 30 },
  { text: "Ganas un torneo local de Smash Bros en el bar gaming de tu ciudad. Cobra 75M.", type: "receive", amount: 75 },
  { text: "Factura de la luz por tener el PC gaming encendido 24/7 minando criptos. Paga 120M.", type: "pay", amount: 120 },
  { text: "Tu vídeo analizando el lore de Dark Souls se hace mega viral. Cobra 100M.", type: "receive", amount: 100 },
  { text: "Encuentras un pase VIP para el backstage del festival. Quédatelo para Salir de la Cárcel gratis.", type: "jail_free" }
];

const LUCK_CARDS = [
  { text: "Viaje exprés a Bilbao para ver a los colegas. Avanza hasta la Estación de AVE. Si pasas por la Salida, cobra 200M.", type: "move_to", index: 25, collectGo: true },
  { text: "Sales a correr tus 10km de rutina, te vienes arriba y acabas apuntándote a una carrera popular. Paga 20M de inscripción.", type: "pay", amount: 20 },
  { text: "Te lías de fiesta y acabas pagando la ronda de chupitos. Paga 15M a cada jugador en la partida.", type: "pay_each", amount: 15 },
  { text: "El ritmo de tu nueva base urbana se hace viral. Las reproducciones te dan 100M.", type: "receive", amount: 100 },
  { text: "Multa de tráfico por ir a más de 120km/h en el Blablacar. Paga 50M.", type: "pay", amount: 50 },
  { text: "Avanza hasta la casilla de Salida. Cobra 200M.", type: "move_to", index: 0, collectGo: true },
  { text: "¡Es tu cumpleaños! Todos te invitan y recibes regalos. Cada jugador te paga 15M.", type: "receive_each", amount: 15 },
  { text: "Vas a dar un paseo por Cadaqués y te encuentras un billete tirado de 50M.", type: "receive", amount: 50 },
  { text: "Comisión bancaria de mantenimiento por tu cuenta inactiva. Paga 25M.", type: "pay", amount: 25 },
  { text: "Te llama tu tía para ayudarte a configurar el router. Te da 50M de propina.", type: "receive", amount: 50 },
  { text: "Te invitan a dar una charla sobre desarrollo web en una universidad. Cobra 100M.", type: "receive", amount: 100 },
  { text: "Pierdes el autobús de vuelta a casa de noche y te toca pedir un Uber de tarifa dinámica. Paga 40M.", type: "pay", amount: 40 },
  { text: "¡Golpe de suerte! Hackeas éticamente una web de comercio y te dan una recompensa por el reporte. Cobra 120M.", type: "receive", amount: 120 },
  { text: "Avanza hasta la casilla de Barcelona. Si pasas por Salida, cobra 200M.", type: "move_to", index: 37, collectGo: true },
  { text: "Avanza hasta la casilla de Melón (casilla 1).", type: "move_to", index: 1, collectGo: false },
  { text: "Encuentras un pase de prensa extraviado. Quédatelo para Salir de la Cárcel gratis.", type: "jail_free" }
];

const COLORS = ["#ff0055", "#00ffcc", "#ffcc00", "#0066ff", "#ff00ff", "#33cc33", "#ff6600", "#9933ff"];

function logMessage(room, message) {
  room.logs.push(`[${new Date().toLocaleTimeString('es-ES')}] ${message}`);
  if (room.logs.length > 50) room.logs.shift();
}

function checkMonopoly(room, color) {
  if (!color) return false;
  const colorProps = room.properties.filter(p => p.color === color);
  if (colorProps.length === 0) return false;
  const firstOwner = colorProps[0].owner;
  if (!firstOwner) return false;
  return colorProps.every(p => p.owner === firstOwner && !p.mortgaged);
}

function calculateRent(room, prop, diceSum) {
  if (prop.owner === null || prop.mortgaged) return 0;
  
  const owner = room.players.find(p => p.id === prop.owner);
  if (!owner || owner.isBankrupt) return 0;

  if (prop.type === "property") {
    if (prop.houses > 0) {
      return prop.rentProgress[prop.houses];
    }
    const hasMonopoly = checkMonopoly(room, prop.color);
    return hasMonopoly ? prop.rentProgress[0] * 2 : prop.rentProgress[0];
  }

  if (prop.type === "transport") {
    const count = room.properties.filter(p => p.type === "transport" && p.owner === prop.owner && !p.mortgaged).length;
    return prop.rentProgress[Math.max(0, Math.min(count - 1, 3))];
  }

  if (prop.type === "service") {
    const count = room.properties.filter(p => p.type === "service" && p.owner === prop.owner && !p.mortgaged).length;
    const factor = count === 2 ? 10 : 4;
    return diceSum * factor;
  }

  return 0;
}

function changeTurn(room) {
  // Clear status of turn roll and actions
  room.hasRolled = false;
  room.doubleCount = 0;
  room.currentTurnAction = 'roll'; // roll, handle_tile, bankrupt_or_pay

  let attempts = 0;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    attempts++;
  } while (room.players[room.turnIndex].isBankrupt && attempts < room.players.length);

  const activePlayer = room.players[room.turnIndex];
  logMessage(room, `Turno de ${activePlayer.username}.`);
}

function startAuction(room, propId) {
  const prop = room.properties.find(p => p.id === propId);
  const activePlayer = room.players[room.turnIndex];
  
  room.auction = {
    active: true,
    propertyId: propId,
    currentBid: 10, // Starts at 10M
    highestBidder: null,
    timeLeft: 15,
    participants: room.players.filter(p => !p.isBankrupt).map(p => p.id)
  };
  
  logMessage(room, `Iniciada subasta por ${prop.name}. Puja inicial: 10M.`);
  runAuctionTimer(room.id);
}

function runAuctionTimer(roomId) {
  const room = rooms[roomId];
  if (!room || !room.auction.active) return;

  if (auctionTimers[roomId]) {
    clearInterval(auctionTimers[roomId]);
  }

  auctionTimers[roomId] = setInterval(() => {
    const r = rooms[roomId];
    if (!r || !r.auction.active) {
      clearInterval(auctionTimers[roomId]);
      delete auctionTimers[roomId];
      return;
    }
    
    r.auction.timeLeft--;
    
    if (r.auction.timeLeft <= 0) {
      clearInterval(auctionTimers[roomId]);
      delete auctionTimers[roomId];
      resolveAuction(r);
    } else {
      io.to(roomId).emit('stateUpdate', cleanRoomState(r));
    }
  }, 1000);
}

function resolveAuction(room) {
  const auction = room.auction;
  auction.active = false;
  
  if (auction.highestBidder) {
    const winner = room.players.find(p => p.id === auction.highestBidder);
    const prop = room.properties.find(p => p.id === auction.propertyId);
    
    if (winner && winner.money >= auction.currentBid) {
      winner.money -= auction.currentBid;
      prop.owner = winner.id;
      logMessage(room, `${winner.username} gana la subasta de ${prop.name} por ${auction.currentBid}M.`);
    } else {
      logMessage(room, `La subasta de ${prop.name} termina sin ganador o por fondos insuficientes.`);
    }
  } else {
    logMessage(room, `La subasta de ${room.properties.find(p => p.id === auction.propertyId).name} finaliza sin pujas.`);
  }
  
  // Transition game turn state back
  room.currentTurnAction = 'ended_action';
  io.to(room.id).emit('stateUpdate', cleanRoomState(room));
}

function cleanRoomState(room) {
  // Return clean state. State is now perfectly serializable without any circular references!
  return JSON.parse(JSON.stringify(room));
}

function verifyBankruptcyOption(room, player) {
  if (player.money >= 0) return false; // not bankrupt
  
  // Check if player has assets to sell or mortgage
  const playerProps = room.properties.filter(p => p.owner === player.id);
  const canSellHouses = playerProps.some(p => p.houses > 0);
  const canMortgage = playerProps.some(p => !p.mortgaged);
  
  if (!canSellHouses && !canMortgage) {
    // Force bankruptcy
    executeBankruptcy(room, player);
    return true;
  }
  
  // Player needs to raise money
  room.currentTurnAction = 'bankrupt_or_pay';
  return false;
}

function executeBankruptcy(room, player) {
  player.isBankrupt = true;
  player.money = 0;
  
  logMessage(room, `¡${player.username} se ha declarado en Bancarrota!`);
  
  // Return properties to Bank or creditor
  const creditorId = room.debtCreditorId;
  const playerProps = room.properties.filter(p => p.owner === player.id);
  
  playerProps.forEach(p => {
    p.houses = 0;
    if (creditorId && creditorId !== 'bank') {
      p.owner = creditorId;
      p.mortgaged = false; // reset mortgage status when transferring
    } else {
      p.owner = null;
      p.mortgaged = false;
    }
  });
  
  // If creditor is another player, transfer player's cards
  if (creditorId && creditorId !== 'bank') {
    const creditor = room.players.find(p => p.id === creditorId);
    if (creditor) {
      creditor.getOutOfJailCards += player.getOutOfJailCards;
      logMessage(room, `Las propiedades y beneficios de ${player.username} han sido transferidos a ${creditor.username}.`);
    }
  } else {
    logMessage(room, `Las propiedades de ${player.username} vuelven a la banca.`);
  }
  
  player.getOutOfJailCards = 0;
  
  // Check win condition
  const activePlayers = room.players.filter(p => !p.isBankrupt);
  if (activePlayers.length <= 1) {
    room.status = 'ended';
    const winner = activePlayers[0];
    logMessage(room, `¡La partida ha terminado! El ganador es ${winner ? winner.username : 'Nadie'}.`);
  } else {
    // If the active player went bankrupt, advance turn
    if (room.players[room.turnIndex].id === player.id) {
      changeTurn(room);
    }
  }
}

io.on('connection', (socket) => {
  console.log(`Socket conectado: ${socket.id}`);

  // 1. Join or Create Room
  socket.on('joinRoom', ({ username, password, roomId, auctionsEnabled }) => {
    let room;
    let isNew = false;
    
    if (!roomId) {
      // Create new room
      roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomId] = {
        id: roomId,
        status: 'lobby',
        players: [],
        turnIndex: 0,
        properties: JSON.parse(JSON.stringify(BOARD_DATA)),
        logs: [],
        settings: { auctionsEnabled: auctionsEnabled !== false },
        doubleCount: 0,
        hasRolled: false,
        currentTurnAction: 'roll', // roll, handle_tile, bankrupt_or_pay, ended_action
        dice: [1, 1],
        auction: { active: false },
        trade: { active: false },
        debtAmount: 0,
        debtCreditorId: null
      };
      room = rooms[roomId];
      isNew = true;
    } else {
      roomId = roomId.toUpperCase();
      room = rooms[roomId];
    }

    if (!room) {
      return socket.emit('errorMsg', 'La sala no existe.');
    }

    // Check if it's a reconnecting player
    const existingPlayer = room.players.find(p => p.username === username);
    if (existingPlayer) {
      // Validate password
      if (existingPlayer.password === password) {
        const oldId = existingPlayer.id;
        
        // If the old socket is still connected (e.g. quick refresh/duplicate tab), disconnect it
        if (oldId !== socket.id) {
          const oldSocket = io.sockets.sockets.get(oldId);
          if (oldSocket) {
            oldSocket.disconnect();
          }
        }
        
        existingPlayer.id = socket.id;
        existingPlayer.online = true;

        // Update ownership and active state references to new socket id
        room.properties.forEach(p => {
          if (p.owner === oldId) p.owner = socket.id;
        });
        if (room.debtCreditorId === oldId) room.debtCreditorId = socket.id;
        if (room.auction.highestBidder === oldId) room.auction.highestBidder = socket.id;

        const timerKey = `${roomId}_${existingPlayer.username}`;
        if (disconnectTimers[timerKey]) {
          clearTimeout(disconnectTimers[timerKey]);
          delete disconnectTimers[timerKey];
        }

        // Cancel complete room cleanup if it was scheduled
        const roomCleanupKey = `cleanup_${roomId}`;
        if (disconnectTimers[roomCleanupKey]) {
          clearTimeout(disconnectTimers[roomCleanupKey]);
          delete disconnectTimers[roomCleanupKey];
        }

        socket.join(roomId);
        socket.roomId = roomId;

        logMessage(room, `${existingPlayer.username} se ha reconectado.`);
        io.to(roomId).emit('stateUpdate', cleanRoomState(room));
        return;
      } else {
        return socket.emit('errorMsg', 'El nombre de usuario ya está en uso o la contraseña es incorrecta.');
      }
    }

    if (room.status !== 'lobby') {
      return socket.emit('errorMsg', 'La partida ya ha comenzado y no estás registrado en ella.');
    }

    if (room.players.length >= 8) {
      return socket.emit('errorMsg', 'La sala está completa (máx. 8 jugadores).');
    }

    // Add player
    const usedColors = room.players.map(p => p.color);
    const playerColor = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];
    const player = {
      id: socket.id,
      username: username || `Invitado_${socket.id.substring(0, 4)}`,
      password: password || '',
      color: playerColor,
      position: 0,
      money: 1500,
      inJail: false,
      jailTurns: 0,
      getOutOfJailCards: 0,
      isBankrupt: false,
      online: true,
      isAdmin: isNew || room.players.length === 0
    };

    room.players.push(player);
    socket.join(roomId);
    socket.roomId = roomId;

    logMessage(room, `${player.username} se ha unido a la sala.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  socket.on('selectColor', ({ color }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'lobby') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const isTaken = room.players.some(p => p.color === color && p.id !== socket.id);
    if (isTaken) {
      return socket.emit('errorMsg', 'Ese color ya ha sido elegido por otro jugador.');
    }

    player.color = color;
    logMessage(room, `${player.username} cambió su color.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // 2. Start Game
  socket.on('startGame', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) return;

    if (room.players.length < 2) {
      return socket.emit('errorMsg', 'Se necesitan al menos 2 jugadores para comenzar.');
    }

    room.status = 'playing';
    room.turnIndex = 0;
    room.logs = [];
    logMessage(room, `¡El juego ha comenzado! Turno de ${room.players[0].username}.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // 3. Roll Dice
  socket.on('rollDice', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing' || room.auction.active || room.trade.active) return;
    if (room.currentTurnAction !== 'roll') return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id) return;
    if (room.hasRolled) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    room.dice = [d1, d2];
    const diceSum = d1 + d2;
    const isDouble = d1 === d2;

    logMessage(room, `${player.username} tira los dados: [${d1}, ${d2}] (Total: ${diceSum}M).`);

    // Handle Jail condition
    if (player.inJail) {
      room.hasRolled = true;
      if (isDouble) {
        player.inJail = false;
        player.jailTurns = 0;
        logMessage(room, `¡${player.username} saca dobles y sale de la cárcel!`);
        // Move immediately
        movePlayer(room, player, diceSum);
      } else {
        player.jailTurns++;
        logMessage(room, `${player.username} no saca dobles en la cárcel (Intento ${player.jailTurns}/3).`);
        if (player.jailTurns >= 3) {
          // Force pay
          room.debtAmount = 50;
          room.debtCreditorId = 'bank';
          room.currentTurnAction = 'bankrupt_or_pay';
          logMessage(room, `${player.username} debe pagar 50M de multa al cumplir 3 turnos en la cárcel.`);
          verifyBankruptcyOption(room, player);
        } else {
          room.currentTurnAction = 'ended_action';
        }
      }
      io.to(roomId).emit('stateUpdate', cleanRoomState(room));
      return;
    }

    if (isDouble) {
      room.doubleCount++;
      logMessage(room, `¡Dobles!`);
      if (room.doubleCount >= 3) {
        player.inJail = true;
        player.position = 10;
        player.jailTurns = 0;
        room.doubleCount = 0;
        room.hasRolled = true;
        room.currentTurnAction = 'ended_action';
        logMessage(room, `¡3 dobles seguidos! ${player.username} va directo a la Cárcel.`);
        io.to(roomId).emit('stateUpdate', cleanRoomState(room));
        return;
      }
    } else {
      room.hasRolled = true;
      room.doubleCount = 0;
    }

    movePlayer(room, player, diceSum);
  });

  function movePlayer(room, player, steps) {
    const prevPosition = player.position;
    player.position = (player.position + steps) % 40;

    // Check pass Go
    if (player.position < prevPosition && player.position !== 10) {
      player.money += 200;
      logMessage(room, `${player.username} pasa por Salida y cobra 200M.`);
    }

    handleTileLand(room, player);
  }

  function handleTileLand(room, player) {
    const tile = room.properties[player.position];
    logMessage(room, `${player.username} cae en ${tile.name}.`);

    room.currentTurnAction = 'handle_tile';

    if (tile.type === 'property' || tile.type === 'transport' || tile.type === 'service') {
      if (tile.owner === null) {
        // Option to buy
        // Keep in handle_tile state until purchase or pass
      } else if (tile.owner === player.id) {
        // Own property, nothing to do
        room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
        if (room.doubleCount > 0) room.hasRolled = false;
      } else {
        // Rent payment
        const owner = room.players.find(p => p.id === tile.owner);
        if (tile.mortgaged) {
          logMessage(room, `${tile.name} está hipotecada. No se paga alquiler.`);
          room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
          if (room.doubleCount > 0) room.hasRolled = false;
        } else {
          const diceSum = room.dice[0] + room.dice[1];
          const rent = calculateRent(room, tile, diceSum);
          room.debtAmount = rent;
          room.debtCreditorId = tile.owner;
          
          logMessage(room, `${player.username} debe pagar ${rent}M de alquiler a ${owner.username}.`);
          
          // Apply payment or enter debt state
          if (player.money >= rent) {
            player.money -= rent;
            owner.money += rent;
            logMessage(room, `Pago de ${rent}M realizado.`);
            room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
            if (room.doubleCount > 0) room.hasRolled = false;
          } else {
            // Debt state
            room.currentTurnAction = 'bankrupt_or_pay';
            verifyBankruptcyOption(room, player);
          }
        }
      }
    } else if (tile.type === 'tax') {
      room.debtAmount = tile.cost;
      room.debtCreditorId = 'bank';
      logMessage(room, `${player.username} debe pagar impuesto: ${tile.cost}M.`);
      
      if (player.money >= tile.cost) {
        player.money -= tile.cost;
        logMessage(room, `Pago de ${tile.cost}M al Capital realizado.`);
        room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
        if (room.doubleCount > 0) room.hasRolled = false;
      } else {
        room.currentTurnAction = 'bankrupt_or_pay';
        verifyBankruptcyOption(room, player);
      }
    } else if (tile.type === 'gotojail') {
      player.inJail = true;
      player.position = 10;
      player.jailTurns = 0;
      room.doubleCount = 0;
      room.hasRolled = true;
      room.currentTurnAction = 'ended_action';
      logMessage(room, `${player.username} va directo a la Cárcel.`);
    } else if (tile.type === 'community') {
      const card = COMMUNITY_CARDS[Math.floor(Math.random() * COMMUNITY_CARDS.length)];
      logMessage(room, `Caja de Comunidad: "${card.text}"`);
      io.to(room.id).emit('cardDrawn', { title: "CAJA DE COMUNIDAD", text: card.text, player: player.username });
      applyCardEffect(room, player, card);
    } else if (tile.type === 'suerte') {
      const card = LUCK_CARDS[Math.floor(Math.random() * LUCK_CARDS.length)];
      logMessage(room, `Suerte: "${card.text}"`);
      io.to(room.id).emit('cardDrawn', { title: "SUERTE", text: card.text, player: player.username });
      applyCardEffect(room, player, card);
    } else {
      // Safe tile: Go, Free Parking, Jail Visits
      room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
      if (room.doubleCount > 0) room.hasRolled = false;
    }

    io.to(room.id).emit('stateUpdate', cleanRoomState(room));
  }

  function applyCardEffect(room, player, card) {
    if (card.type === 'pay') {
      room.debtAmount = card.amount;
      room.debtCreditorId = 'bank';
      if (player.money >= card.amount) {
        player.money -= card.amount;
        logMessage(room, `${player.username} paga ${card.amount}M.`);
        room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
        if (room.doubleCount > 0) room.hasRolled = false;
      } else {
        room.currentTurnAction = 'bankrupt_or_pay';
        verifyBankruptcyOption(room, player);
      }
    } else if (card.type === 'receive') {
      player.money += card.amount;
      logMessage(room, `${player.username} cobra ${card.amount}M.`);
      room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
      if (room.doubleCount > 0) room.hasRolled = false;
    } else if (card.type === 'jail') {
      player.inJail = true;
      player.position = 10;
      player.jailTurns = 0;
      room.doubleCount = 0;
      room.hasRolled = true;
      room.currentTurnAction = 'ended_action';
      logMessage(room, `${player.username} va directo a la Cárcel.`);
    } else if (card.type === 'pay_each') {
      const otherPlayers = room.players.filter(p => p.id !== player.id && !p.isBankrupt);
      const totalCost = card.amount * otherPlayers.length;
      room.debtAmount = totalCost;
      room.debtCreditorId = 'bank_each'; // special status to split money
      
      if (player.money >= totalCost) {
        player.money -= totalCost;
        otherPlayers.forEach(p => p.money += card.amount);
        logMessage(room, `${player.username} paga ${card.amount}M a cada jugador (Total: ${totalCost}M).`);
        room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
        if (room.doubleCount > 0) room.hasRolled = false;
      } else {
        room.currentTurnAction = 'bankrupt_or_pay';
        verifyBankruptcyOption(room, player);
      }
    } else if (card.type === 'move_to') {
      const prevPosition = player.position;
      player.position = card.index;
      logMessage(room, `${player.username} se desplaza a la casilla ${room.properties[card.index].name}.`);
      
      if (card.collectGo && player.position < prevPosition) {
        player.money += 200;
        logMessage(room, `${player.username} pasa por Salida y cobra 200M.`);
      }
      
      // trigger land logic again
      handleTileLand(room, player);
    } else if (card.type === 'receive_each') {
      const otherPlayers = room.players.filter(p => p.id !== player.id && !p.isBankrupt);
      let totalReceived = 0;
      otherPlayers.forEach(p => {
        p.money -= card.amount;
        totalReceived += card.amount;
      });
      player.money += totalReceived;
      logMessage(room, `${player.username} cobra ${card.amount}M de cada jugador (Total: ${totalReceived}M).`);
      room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
      if (room.doubleCount > 0) room.hasRolled = false;
    } else if (card.type === 'jail_free') {
      player.getOutOfJailCards++;
      logMessage(room, `${player.username} obtiene una tarjeta de Salir de la Cárcel gratis.`);
      room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
      if (room.doubleCount > 0) room.hasRolled = false;
    }
  }

  // 4. Buy Property
  socket.on('buyProperty', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id) return;
    if (room.currentTurnAction !== 'handle_tile') return;

    const tile = room.properties[player.position];
    if (tile.owner !== null || tile.price === null) return;

    if (player.money >= tile.price) {
      player.money -= tile.price;
      tile.owner = player.id;
      logMessage(room, `${player.username} compra ${tile.name} por ${tile.price}M.`);
      
      // Advance action
      room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
      if (room.doubleCount > 0) room.hasRolled = false;
      io.to(roomId).emit('stateUpdate', cleanRoomState(room));
    } else {
      socket.emit('errorMsg', 'No tienes suficiente dinero.');
    }
  });

  // 5. Pass / Decline Purchase
  socket.on('declineProperty', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id) return;
    if (room.currentTurnAction !== 'handle_tile') return;

    const tile = room.properties[player.position];
    if (tile.owner !== null || tile.price === null) return;

    logMessage(room, `${player.username} decide no comprar ${tile.name}.`);

    if (room.settings.auctionsEnabled) {
      startAuction(room, tile.id);
    } else {
      room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
      if (room.doubleCount > 0) room.hasRolled = false;
    }
    
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // 6. Auction Bidding
  socket.on('submitBid', ({ bidAmount }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || !room.auction.active) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isBankrupt) return;

    if (bidAmount <= room.auction.currentBid) {
      return socket.emit('errorMsg', 'La puja debe ser superior a la actual.');
    }

    if (player.money < bidAmount) {
      return socket.emit('errorMsg', 'No tienes suficiente dinero para esta puja.');
    }

    room.auction.currentBid = bidAmount;
    room.auction.highestBidder = player.id;
    room.auction.timeLeft = 10; // reset to 10 seconds remaining
    
    logMessage(room, `Nueva puja por ${room.properties[room.auction.propertyId].name}: ${bidAmount}M por ${player.username}.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // 7. House/Hotel Management (Build & Sell)
  socket.on('buildHouse', ({ propertyId }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const prop = room.properties.find(p => p.id === propertyId);
    if (!prop || prop.owner !== socket.id || prop.type !== 'property' || prop.mortgaged) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isBankrupt) return;

    // Check monopoly
    if (!checkMonopoly(room, prop.color)) {
      return socket.emit('errorMsg', 'Debes poseer todas las propiedades de este color para construir.');
    }

    if (prop.houses >= 5) {
      return socket.emit('errorMsg', 'Ya tienes un Hotel en esta casilla.');
    }

    if (player.money < prop.housePrice) {
      return socket.emit('errorMsg', 'No tienes suficiente dinero para construir.');
    }

    // Uniform building rule check
    const colorProps = room.properties.filter(p => p.color === prop.color);
    const minHouses = Math.min(...colorProps.map(p => p.houses));
    if (prop.houses > minHouses) {
      return socket.emit('errorMsg', 'Regla de Edificación Uniforme: debes edificar equitativamente en todo el grupo.');
    }

    // Build
    player.money -= prop.housePrice;
    prop.houses++;
    logMessage(room, `${player.username} edifica en ${prop.name} (Casas/Hotel: ${prop.houses}).`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  socket.on('sellHouse', ({ propertyId }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const prop = room.properties.find(p => p.id === propertyId);
    if (!prop || prop.owner !== socket.id || prop.houses === 0) return;

    const player = room.players.find(p => p.id === socket.id);

    // Uniform building rule check
    const colorProps = room.properties.filter(p => p.color === prop.color);
    const maxHouses = Math.max(...colorProps.map(p => p.houses));
    if (prop.houses < maxHouses) {
      return socket.emit('errorMsg', 'Regla de Edificación Uniforme: debes vender de forma equitativa.');
    }

    // Sell (costs half the original price)
    const refund = Math.floor(prop.housePrice / 2);
    player.money += refund;
    prop.houses--;
    logMessage(room, `${player.username} vende edificación en ${prop.name}. Reembolso: ${refund}M.`);
    
    // Check if debt resolved
    if (room.currentTurnAction === 'bankrupt_or_pay' && player.id === room.players[room.turnIndex].id) {
      handleDebtResolutionCheck(room, player);
    } else {
      io.to(roomId).emit('stateUpdate', cleanRoomState(room));
    }
  });

  // 8. Mortgaging (Hipotecar / Deshipotecar)
  socket.on('mortgageProperty', ({ propertyId }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const prop = room.properties.find(p => p.id === propertyId);
    if (!prop || prop.owner !== socket.id || prop.mortgaged) return;

    if (prop.houses > 0) {
      return socket.emit('errorMsg', 'Debes vender todas las casas de esta propiedad antes de hipotecarla.');
    }

    const player = room.players.find(p => p.id === socket.id);
    const mortgageValue = Math.floor(prop.price / 2);
    
    prop.mortgaged = true;
    player.money += mortgageValue;
    
    logMessage(room, `${player.username} hipoteca ${prop.name} por ${mortgageValue}M.`);

    // Check if debt resolved
    if (room.currentTurnAction === 'bankrupt_or_pay' && player.id === room.players[room.turnIndex].id) {
      handleDebtResolutionCheck(room, player);
    } else {
      io.to(roomId).emit('stateUpdate', cleanRoomState(room));
    }
  });

  socket.on('unmortgageProperty', ({ propertyId }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const prop = room.properties.find(p => p.id === propertyId);
    if (!prop || prop.owner !== socket.id || !prop.mortgaged) return;

    const player = room.players.find(p => p.id === socket.id);
    // Unmortgage costs mortgage value + 10%
    const mortgageValue = Math.floor(prop.price / 2);
    const unmortgageCost = Math.floor(mortgageValue * 1.1);

    if (player.money < unmortgageCost) {
      return socket.emit('errorMsg', `Necesitas ${unmortgageCost}M para deshipotecar esta propiedad.`);
    }

    player.money -= unmortgageCost;
    prop.mortgaged = false;

    logMessage(room, `${player.username} deshipoteca ${prop.name} por ${unmortgageCost}M.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // Helper function to re-evaluate debt after sale/mortgage
  function handleDebtResolutionCheck(room, player) {
    if (player.money >= room.debtAmount) {
      const rent = room.debtAmount;
      const creditorId = room.debtCreditorId;
      player.money -= rent;
      
      if (creditorId === 'bank') {
        logMessage(room, `${player.username} paga su deuda de ${rent}M a la Banca.`);
        if (player.inJail && player.jailTurns >= 3) {
          player.inJail = false;
          player.jailTurns = 0;
          // Player moves with the dice roll they just threw
          const diceSum = room.dice[0] + room.dice[1];
          logMessage(room, `${player.username} sale de la cárcel y avanza ${diceSum} casillas.`);
          room.debtAmount = 0;
          room.debtCreditorId = null;
          movePlayer(room, player, diceSum);
          return;
        }
      } else if (creditorId === 'bank_each') {
        const otherPlayers = room.players.filter(p => p.id !== player.id && !p.isBankrupt);
        const splitAmount = Math.floor(rent / otherPlayers.length);
        otherPlayers.forEach(p => p.money += splitAmount);
        logMessage(room, `${player.username} paga su deuda total de ${rent}M a los demás jugadores.`);
      } else {
        const creditor = room.players.find(p => p.id === creditorId);
        if (creditor) {
          creditor.money += rent;
          logMessage(room, `${player.username} paga su deuda de ${rent}M a ${creditor.username}.`);
        }
      }
      
      room.debtAmount = 0;
      room.debtCreditorId = null;
      room.currentTurnAction = room.doubleCount > 0 ? 'roll' : 'ended_action';
      if (room.doubleCount > 0) room.hasRolled = false;
    }
    io.to(room.id).emit('stateUpdate', cleanRoomState(room));
  }

  // 9. Pay Debt directly (when player has enough cash)
  socket.on('payDebt', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id || room.currentTurnAction !== 'bankrupt_or_pay') return;

    if (player.money >= room.debtAmount) {
      handleDebtResolutionCheck(room, player);
    } else {
      socket.emit('errorMsg', 'No tienes dinero suficiente. Vende casas o hipoteca propiedades.');
    }
  });

  // 10. Declare Bankrupt manually (when debt cannot be resolved)
  socket.on('declareBankrupt', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isBankrupt) return;

    executeBankruptcy(room, player);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // 11. End Turn
  socket.on('endTurn', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing' || room.auction.active || room.trade.active) return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id) return;
    if (room.currentTurnAction !== 'ended_action' && room.currentTurnAction !== 'roll') return;

    changeTurn(room);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // 12. Trade / Negotiation System
  socket.on('proposeTrade', ({ receiverId, senderOffer, receiverOffer }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.trade.active || room.auction.active || room.currentTurnAction === 'bankrupt_or_pay') return;

    const sender = room.players.find(p => p.id === socket.id);
    const receiver = room.players.find(p => p.id === receiverId);

    if (!sender || !receiver || sender.isBankrupt || receiver.isBankrupt) return;

    // Validate offer funds
    if (senderOffer.money > sender.money) {
      return socket.emit('errorMsg', 'No tienes suficiente dinero para ofrecer.');
    }
    if (receiverOffer.money > receiver.money) {
      return socket.emit('errorMsg', 'El receptor no tiene suficiente dinero para ese intercambio.');
    }

    // Set active trade state
    room.trade = {
      active: true,
      senderId: sender.id,
      receiverId: receiver.id,
      senderOffer,
      receiverOffer
    };

    logMessage(room, `${sender.username} propone un trato a ${receiver.username}.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  socket.on('acceptTrade', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || !room.trade.active) return;

    const trade = room.trade;
    if (socket.id !== trade.receiverId) return;

    const sender = room.players.find(p => p.id === trade.senderId);
    const receiver = room.players.find(p => p.id === trade.receiverId);

    if (!sender || !receiver || sender.isBankrupt || receiver.isBankrupt) {
      trade.active = false;
      return io.to(roomId).emit('stateUpdate', cleanRoomState(room));
    }

    // Validate once more
    if (sender.money < trade.senderOffer.money || receiver.money < trade.receiverOffer.money) {
      trade.active = false;
      logMessage(room, `Intercambio cancelado: fondos insuficientes.`);
      return io.to(roomId).emit('stateUpdate', cleanRoomState(room));
    }

    // Transfer money
    sender.money = sender.money - trade.senderOffer.money + trade.receiverOffer.money;
    receiver.money = receiver.money - trade.receiverOffer.money + trade.senderOffer.money;

    // Transfer properties
    trade.senderOffer.properties.forEach(propId => {
      const p = room.properties.find(prop => prop.id === propId);
      if (p && p.owner === sender.id) {
        p.owner = receiver.id;
        p.houses = 0; // standard rule: selling color sets resets houses
      }
    });

    trade.receiverOffer.properties.forEach(propId => {
      const p = room.properties.find(prop => prop.id === propId);
      if (p && p.owner === receiver.id) {
        p.owner = sender.id;
        p.houses = 0;
      }
    });

    // Transfer Jail Cards
    sender.getOutOfJailCards = sender.getOutOfJailCards - trade.senderOffer.jailCards + trade.receiverOffer.jailCards;
    receiver.getOutOfJailCards = receiver.getOutOfJailCards - trade.receiverOffer.jailCards + trade.senderOffer.jailCards;

    trade.active = false;
    logMessage(room, `¡El trato entre ${sender.username} y ${receiver.username} ha sido ACEPTADO!`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  socket.on('rejectTrade', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || !room.trade.active) return;

    if (socket.id !== room.trade.receiverId && socket.id !== room.trade.senderId) return;

    const sender = room.players.find(p => p.id === room.trade.senderId);
    const receiver = room.players.find(p => p.id === room.trade.receiverId);

    room.trade.active = false;
    logMessage(room, `${receiver.username} ha rechazado el trato propuesto por ${sender.username}.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  socket.on('counterTrade', ({ senderOffer, receiverOffer }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || !room.trade.active) return;

    if (socket.id !== room.trade.receiverId) return; // Only receiver can counter

    const originalSenderId = room.trade.senderId;
    const originalReceiverId = room.trade.receiverId;

    // Swap roles for the counter offer
    room.trade.senderId = originalReceiverId;
    room.trade.receiverId = originalSenderId;
    room.trade.senderOffer = senderOffer;
    room.trade.receiverOffer = receiverOffer;

    const newSender = room.players.find(p => p.id === room.trade.senderId);
    const newReceiver = room.players.find(p => p.id === room.trade.receiverId);

    logMessage(room, `${newSender.username} realiza una contraoferta a ${newReceiver.username}.`);
    io.to(roomId).emit('stateUpdate', cleanRoomState(room));
  });

  // 13. Pay Jail Fine to get out immediately
  socket.on('payJailFine', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id || !player.inJail) return;

    if (player.money >= 50) {
      player.money -= 50;
      player.inJail = false;
      player.jailTurns = 0;
      logMessage(room, `${player.username} paga 50M de multa y sale de la cárcel.`);
      
      // Let player roll dice now (standard rules allow rolling after paying jail fine on start of turn)
      room.hasRolled = false;
      room.currentTurnAction = 'roll';
      io.to(roomId).emit('stateUpdate', cleanRoomState(room));
    } else {
      socket.emit('errorMsg', 'No tienes suficiente dinero para pagar la multa.');
    }
  });

  // 14. Use Get Out Of Jail Card
  socket.on('useJailCard', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.turnIndex];
    if (player.id !== socket.id || !player.inJail) return;

    if (player.getOutOfJailCards > 0) {
      player.getOutOfJailCards--;
      player.inJail = false;
      player.jailTurns = 0;
      logMessage(room, `${player.username} usa tarjeta de 'Salir de la cárcel gratis' y queda libre.`);
      
      room.hasRolled = false;
      room.currentTurnAction = 'roll';
      io.to(roomId).emit('stateUpdate', cleanRoomState(room));
    } else {
      socket.emit('errorMsg', 'No tienes tarjetas de salir de la cárcel.');
    }
  });

  // 15. Disconnect / Leave
  socket.on('disconnect', () => {
    console.log(`Socket desconectado: ${socket.id}`);
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1) {
      const player = room.players[playerIndex];
      
      if (room.status === 'lobby') {
        // Safe to remove immediately in lobby
        room.players.splice(playerIndex, 1);
        if (player.isAdmin && room.players.length > 0) {
          room.players[0].isAdmin = true;
        }
        logMessage(room, `${player.username} ha salido de la sala.`);
        
        // Check if room is empty
        if (room.players.length === 0) {
          delete rooms[roomId];
          console.log(`Sala vacía eliminada: ${roomId}`);
        } else {
          io.to(roomId).emit('stateUpdate', cleanRoomState(room));
        }
      } else {
        // In game, mark offline and wait for 30s reconnection
        if (!player.isBankrupt && player.online) {
          player.online = false;
          // Clear active trade if disconnecting player was part of it
          if (room.trade.active && (room.trade.senderId === player.id || room.trade.receiverId === player.id)) {
            room.trade.active = false;
            logMessage(room, `El trato activo se ha cancelado debido a una desconexión.`);
          }
          
          // Cancel auction if they were the highest bidder
          if (room.auction && room.auction.active && room.auction.highestBidder === player.id) {
            logMessage(room, `El máximo postor se ha desconectado. Subasta cancelada.`);
            if (auctionTimers[roomId]) {
              clearInterval(auctionTimers[roomId]);
              delete auctionTimers[roomId];
            }
            room.auction = { active: false, propIndex: null, currentBid: 0, highestBidder: null, participants: [], timer: 0 };
            room.currentTurnAction = 'ended_action';
          }

          logMessage(room, `${player.username} se ha desconectado. Esperando reconexión (300s)...`);
          io.to(roomId).emit('stateUpdate', cleanRoomState(room));

          const timerKey = `${roomId}_${player.username}`;
          if (disconnectTimers[timerKey]) clearTimeout(disconnectTimers[timerKey]);
          
          disconnectTimers[timerKey] = setTimeout(() => {
            const r = rooms[roomId];
            if (r) {
              const p = r.players.find(pl => pl.username === player.username);
              if (p && !p.online && !p.isBankrupt) {
                logMessage(r, `${p.username} ha sido declarado en bancarrota por desconexión prolongada.`);
                executeBankruptcy(r, p);
                io.to(roomId).emit('stateUpdate', cleanRoomState(r));
              }
            }
            delete disconnectTimers[timerKey];
          }, 300000);
        }
      }

      // Check if all players left or room is completely inactive
      const activeOnlineCount = room.players.filter(p => p.online && !p.isBankrupt).length;
      if (activeOnlineCount === 0) {
        const roomCleanupKey = `cleanup_${roomId}`;
        if (disconnectTimers[roomCleanupKey]) clearTimeout(disconnectTimers[roomCleanupKey]);
        
        disconnectTimers[roomCleanupKey] = setTimeout(() => {
          const r = rooms[roomId];
          if (r && r.players.filter(p => p.online && !p.isBankrupt).length === 0) {
            if (auctionTimers[roomId]) {
              clearInterval(auctionTimers[roomId]);
              delete auctionTimers[roomId];
            }
            delete rooms[roomId];
            console.log(`Sala inactiva eliminada por abandono completo: ${roomId}`);
          }
          delete disconnectTimers[roomCleanupKey];
        }, 300000); // 5 minutes cleanup
      }
    }
  });
});



server.listen(PORT, () => {
  console.log(`Servidor PAKOPOLY V1 corriendo en http://localhost:${PORT}`);
});
