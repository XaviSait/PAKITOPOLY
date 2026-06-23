// Connect to the socket server
const socket = io();

// Game state variables
let localPlayerId = null;
let currentGameState = null;
let selectedPlayerId = null; // selected player in the dashboard
let activePropertyId = null; // currently selected property for action
let currentOverlayType = null; // 'card' | 'deed-landing' | 'deed-inspect'
let pendingOverlayCard = null; // Stored card or deed overlay details while token is moving

// Web Audio API Sound System
const SoundSystem = {
  ctx: null,

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  playTone(freq, duration, type = 'sine', slideTo = null) {
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
      }

      gainNode.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  },

  playDice() {
    // Short fast sweeps mimicking dice rattling
    this.playTone(300, 0.08, 'triangle', 600);
    setTimeout(() => this.playTone(400, 0.08, 'triangle', 200), 100);
    setTimeout(() => this.playTone(250, 0.12, 'triangle', 500), 200);
  },

  playMoney() {
    // Standard double beep (cash register sound)
    this.playTone(880, 0.1, 'sine');
    setTimeout(() => this.playTone(1320, 0.18, 'sine'), 100);
  },

  playSuccess() {
    // Arpeggio up
    this.playTone(523.25, 0.08, 'sine'); // C5
    setTimeout(() => this.playTone(659.25, 0.08, 'sine'), 80); // E5
    setTimeout(() => this.playTone(783.99, 0.08, 'sine'), 160); // G5
    setTimeout(() => this.playTone(1046.50, 0.15, 'sine'), 240); // C6
  },

  playJail() {
    // Descending buzzer sound
    this.playTone(300, 0.4, 'sawtooth', 80);
  },

  playCard() {
    // Card sliding sound (pitch modulation)
    this.playTone(600, 0.25, 'triangle', 150);
  }
};

// Toast notification helper
function showToast(message, isAlert = false) {
  const toast = document.getElementById('alert-notification');
  toast.innerText = message;
  toast.style.borderColor = isAlert ? 'var(--neon-pink)' : 'var(--neon-blue)';
  toast.style.boxShadow = isAlert ? '0 0 15px rgba(255, 0, 85, 0.4)' : '0 0 15px rgba(0, 229, 255, 0.3)';
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// ----------------------------------------------------
// SCREEN TRANSITIONS & TAB NAVIGATION
// ----------------------------------------------------

// Lobby Tabs: Create vs Join
document.getElementById('btn-tab-create').addEventListener('click', () => {
  document.getElementById('btn-tab-create').classList.add('active');
  document.getElementById('btn-tab-join').classList.remove('active');
  document.getElementById('lobby-create-settings').classList.add('active');
  document.getElementById('lobby-join-settings').classList.remove('active');
});

document.getElementById('btn-tab-join').addEventListener('click', () => {
  document.getElementById('btn-tab-create').classList.remove('active');
  document.getElementById('btn-tab-join').classList.add('active');
  document.getElementById('lobby-create-settings').classList.remove('active');
  document.getElementById('lobby-join-settings').classList.add('active');
});

// Mobile column navigation tabs
const mobileTabs = ['board', 'panel', 'assets'];
mobileTabs.forEach(tab => {
  document.getElementById(`tab-btn-${tab}`).addEventListener('click', (e) => {
    mobileTabs.forEach(t => {
      document.getElementById(`tab-btn-${t}`).classList.remove('active');
      document.querySelector(`.column-${t}`).classList.remove('active');
    });
    e.target.classList.add('active');
    document.querySelector(`.column-${tab}`).classList.add('active');
  });
});

// Lobby actions
document.getElementById('btn-create-room').addEventListener('click', () => {
  SoundSystem.init();
  const username = document.getElementById('lobby-username').value.trim();
  const password = document.getElementById('lobby-password').value.trim();
  if (!username) return showToast('Introduce tu nombre de usuario', true);
  if (!password) return showToast('Introduce una contraseña para reconexión', true);
  
  const auctionsEnabled = document.getElementById('lobby-auctions-toggle').checked;
  
  // Save credentials to localStorage
  localStorage.setItem('monopoly_username', username);
  localStorage.setItem('monopoly_password', password);
  
  socket.emit('joinRoom', { username, password, roomId: null, auctionsEnabled });
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  SoundSystem.init();
  const username = document.getElementById('lobby-username').value.trim();
  const password = document.getElementById('lobby-password').value.trim();
  const roomId = document.getElementById('lobby-room-id').value.trim().toUpperCase();
  
  if (!username) return showToast('Introduce tu nombre de usuario', true);
  if (!password) return showToast('Introduce tu contraseña', true);
  if (!roomId) return showToast('Introduce el código de sala', true);
  
  // Save credentials to localStorage
  localStorage.setItem('monopoly_username', username);
  localStorage.setItem('monopoly_password', password);
  localStorage.setItem('monopoly_room_id', roomId);
  
  socket.emit('joinRoom', { username, password, roomId });
});

// Copy Invite Code
document.getElementById('btn-copy-link').addEventListener('click', () => {
  if (currentGameState && currentGameState.id) {
    navigator.clipboard.writeText(currentGameState.id)
      .then(() => showToast('Código de sala copiado al portapapeles!'))
      .catch(() => showToast('Error al copiar el código.', true));
  }
});

// Admin start game
document.getElementById('btn-start-game').addEventListener('click', () => {
  socket.emit('startGame');
});

// ----------------------------------------------------
// GAME STATE RENDERING
// ----------------------------------------------------

socket.on('connect', () => {
  localPlayerId = socket.id;
  
  // Auto-reconnect if saved credentials exist
  const savedUsername = localStorage.getItem('monopoly_username');
  const savedPassword = localStorage.getItem('monopoly_password');
  const savedRoomId = localStorage.getItem('monopoly_room_id');
  if (savedUsername && savedPassword && savedRoomId) {
    console.log(`Intentando reconexión automática a sala ${savedRoomId} como ${savedUsername}`);
    socket.emit('joinRoom', { username: savedUsername, password: savedPassword, roomId: savedRoomId });
  }
});

socket.on('errorMsg', (msg) => {
  showToast(msg, true);
  SoundSystem.playJail();
  // Clear room ID from localStorage if joining/reconnecting failed
  if (msg.includes('sala no existe') || msg.includes('ya está en uso') || msg.includes('ya ha comenzado')) {
    localStorage.removeItem('monopoly_room_id');
    // Send back to lobby screen
    document.getElementById('screen-game').classList.remove('active');
    document.getElementById('screen-lobby').classList.add('active');
  }
});

socket.on('stateUpdate', (state) => {
  const isFirstLoad = !currentGameState;
  
  // Track events for sound effects
  if (currentGameState) {
    // Check if dice changed (roll event)
    if (JSON.stringify(currentGameState.dice) !== JSON.stringify(state.dice)) {
      SoundSystem.playDice();
      animateDice(state.dice[0], state.dice[1]);
    }
    // Check if log count grew (new events)
    if (state.logs.length > currentGameState.logs.length) {
      const lastLog = state.logs[state.logs.length - 1];
      if (lastLog.includes('pagó') || lastLog.includes('cobró') || lastLog.includes('impuesto') || lastLog.includes('compra') || lastLog.includes('Banca')) {
        SoundSystem.playMoney();
      } else if (lastLog.includes('Cárcel')) {
        SoundSystem.playJail();
      } else if (lastLog.includes('Caja de Comunidad') || lastLog.includes('Suerte')) {
        SoundSystem.playCard();
      }
    }
  }

  currentGameState = state;
  localPlayerId = socket.id;

  // Save room ID to localStorage
  if (state.id) {
    localStorage.setItem('monopoly_room_id', state.id);
  }
  if (state.status === 'ended') {
    localStorage.removeItem('monopoly_room_id');
  }

  // Move to Game Screen if first state update
  if (isFirstLoad) {
    document.getElementById('screen-lobby').classList.remove('active');
    document.getElementById('screen-game').classList.add('active');
    document.getElementById('display-room-id').innerText = state.id;
    selectedPlayerId = localPlayerId; // select self by default
  }

  // 1. Render Lobby / Game containers
  if (state.status === 'lobby') {
    boardInitialized = false;
    for (let id in playerTokens) {
      if (playerTokens[id]) playerTokens[id].remove();
      delete playerTokens[id];
    }
    for (let id in playerPositions) {
      delete playerPositions[id];
    }
    animatingPlayers.clear();

    document.getElementById('panel-lobby-waiting').style.display = 'block';
    document.getElementById('panel-game-controls').style.display = 'none';
    
    // Render waiting players
    const list = document.getElementById('waiting-players-list');
    list.innerHTML = '';
    
    state.players.forEach(p => {
      const li = document.createElement('li');
      li.style.borderLeftColor = p.color;
      li.innerHTML = `${p.username} ${p.isAdmin ? '<span class="admin-badge">CREADOR</span>' : ''}`;
      list.appendChild(li);
    });

    // Render color picker
    const colorsList = document.getElementById('lobby-colors-list');
    if (colorsList) {
      colorsList.innerHTML = '';
      const localPlayer = state.players.find(p => p.id === localPlayerId);
      const usedColors = state.players.map(p => p.color);
      const ALL_COLORS = ["#ff0055", "#00ffcc", "#ffcc00", "#0066ff", "#ff00ff", "#33cc33", "#ff6600", "#9933ff"];
      
      ALL_COLORS.forEach(color => {
        const btn = document.createElement('div');
        btn.className = 'lobby-color-dot';
        btn.style.backgroundColor = color;
        
        const isCurrent = localPlayer && localPlayer.color === color;
        const isUsed = usedColors.includes(color) && !isCurrent;
        
        if (isCurrent) {
          btn.classList.add('selected');
        }
        if (isUsed) {
          btn.classList.add('used');
        }
        
        btn.addEventListener('click', () => {
          if (!isUsed && !isCurrent) {
            socket.emit('selectColor', { color });
          }
        });
        
        colorsList.appendChild(btn);
      });
    }

    const localPlayer = state.players.find(p => p.id === localPlayerId);
    if (localPlayer && localPlayer.isAdmin) {
      document.getElementById('btn-start-game').style.display = 'block';
      document.getElementById('non-admin-msg').style.display = 'none';
    } else {
      document.getElementById('btn-start-game').style.display = 'none';
      document.getElementById('non-admin-msg').style.display = 'block';
    }
  } else {
    // In game
    document.getElementById('panel-lobby-waiting').style.display = 'none';
    document.getElementById('panel-game-controls').style.display = 'block';
    
    // Render inactivity timer
    const timerBadge = document.getElementById('turn-timer-badge');
    if (state.status === 'playing' && state.turnTimeLeft !== undefined) {
      timerBadge.style.display = 'inline-block';
      timerBadge.innerText = `⏱ ${state.turnTimeLeft}s`;
      if (state.turnTimeLeft <= 10) {
        timerBadge.style.backgroundColor = 'var(--neon-pink)';
        timerBadge.style.boxShadow = '0 0 10px var(--neon-pink)';
        timerBadge.style.animation = 'buttonPulse 1.0s infinite alternate';
      } else {
        timerBadge.style.backgroundColor = 'var(--neon-blue)';
        timerBadge.style.boxShadow = '0 0 10px var(--neon-blue)';
        timerBadge.style.animation = 'none';
      }
    } else {
      timerBadge.style.display = 'none';
    }

    renderBoard(state);
    renderControls(state);
    renderPlayersList(state);
    renderPropertiesDeck(state);
    renderLogs(state);
    renderAuctionModal(state);
    renderTradeModal(state);
    
    // Refresh the center overlay card if open
    refreshCenterOverlayCard();
  }
});

// Render the 11x11 Board cells
let boardInitialized = false;
const playerTokens = {};
const playerPositions = {};
const animatingPlayers = new Set();

function renderBoard(state) {
  if (!boardInitialized) {
    initBoard(state);
    boardInitialized = true;
  }
  updateBoard(state);
}

function initBoard(state) {
  const boardDiv = document.getElementById('board');
  const centerDiv = boardDiv.querySelector('.board-center');
  
  boardDiv.innerHTML = '';
  boardDiv.appendChild(centerDiv);

  state.properties.forEach(prop => {
    const cellDiv = document.createElement('div');
    cellDiv.className = `cell cell-${prop.id}`;
    if (prop.id === 0 || prop.id === 10 || prop.id === 20 || prop.id === 30) {
      cellDiv.classList.add('cell-corner');
    }
    
    // Header for property colors
    if (prop.type === 'property' && prop.color) {
      const headerColor = document.createElement('div');
      headerColor.className = `cell-header-color color-${prop.color}`;
      cellDiv.appendChild(headerColor);
    }
    
    // Cell Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'cell-name';
    nameSpan.innerText = prop.name;
    cellDiv.appendChild(nameSpan);

    // Create container for houses
    const housesContainer = document.createElement('div');
    housesContainer.className = 'houses-container';
    cellDiv.appendChild(housesContainer);

    // Create mortgage tag
    const mortgageTag = document.createElement('div');
    mortgageTag.className = 'mortgage-tag';
    mortgageTag.style.display = 'none';
    mortgageTag.innerText = 'HIPOTECA';
    cellDiv.appendChild(mortgageTag);

    // Create price element
    if (prop.price !== null) {
      const priceSpan = document.createElement('span');
      priceSpan.className = 'cell-price';
      priceSpan.innerText = `${prop.price}M`;
      cellDiv.appendChild(priceSpan);
    }

    // Add click event to focus selection
    cellDiv.addEventListener('click', () => {
      if (prop.owner) {
        selectedPlayerId = prop.owner;
        renderPlayersList(currentGameState);
        renderPropertiesDeck(currentGameState);
      }
    });

    boardDiv.appendChild(cellDiv);
  });

  // Create tokens layer overlay
  const tokensLayer = document.createElement('div');
  tokensLayer.id = 'tokens-layer';
  tokensLayer.style.position = 'absolute';
  tokensLayer.style.top = '0';
  tokensLayer.style.left = '0';
  tokensLayer.style.width = '100%';
  tokensLayer.style.height = '100%';
  tokensLayer.style.pointerEvents = 'none';
  tokensLayer.style.zIndex = '50';
  boardDiv.appendChild(tokensLayer);
}

function updateBoard(state) {
  // Update center actions description
  const activePlayer = state.players[state.turnIndex];
  const localPlayer = state.players.find(p => p.id === localPlayerId);
  const currentTile = state.properties[activePlayer.position];
  
  let actionText = `Turno de ${activePlayer.username}. `;
  if (state.auction.active) {
    actionText = `Subasta activa de ${state.properties[state.auction.propertyId].name}!`;
  } else if (state.trade.active) {
    const sender = state.players.find(p => p.id === state.trade.senderId);
    const receiver = state.players.find(p => p.id === state.trade.receiverId);
    actionText = `Negociación en curso entre ${sender.username} y ${receiver.username}.`;
  } else if (state.currentTurnAction === 'roll') {
    actionText += `Debe lanzar los dados.`;
  } else if (state.currentTurnAction === 'handle_tile') {
    if (currentTile.owner === null) {
      actionText += `Decidiendo comprar ${currentTile.name}.`;
    }
  } else if (state.currentTurnAction === 'bankrupt_or_pay') {
    if (activePlayer.id === localPlayerId) {
      actionText = `¡Deuda pendiente de ${state.debtAmount}M! Vende casas o hipoteca para pagar.`;
    } else {
      actionText = `${activePlayer.username} tiene una deuda de ${state.debtAmount}M y está gestionando fondos.`;
    }
  } else if (state.currentTurnAction === 'ended_action') {
    actionText += `Fin del movimiento. Debe pasar el turno.`;
  }

  document.getElementById('current-action-text').innerText = actionText;

  // Dice visual (only if not currently rolling)
  const die1 = document.getElementById('die-1');
  const die2 = document.getElementById('die-2');
  if (die1 && die2 && !die1.classList.contains('rolling')) {
    die1.innerText = state.dice[0];
    die2.innerText = state.dice[1];
  }

  state.properties.forEach(prop => {
    const cellDiv = document.querySelector(`.cell-${prop.id}`);
    if (!cellDiv) return;

    // Update houses
    const housesContainer = cellDiv.querySelector('.houses-container');
    if (housesContainer) {
      housesContainer.innerHTML = '';
      if (prop.houses === 5) {
        const hotelDot = document.createElement('div');
        hotelDot.className = 'hotel-dot';
        housesContainer.appendChild(hotelDot);
      } else if (prop.houses > 0) {
        for (let i = 0; i < prop.houses; i++) {
          const houseDot = document.createElement('div');
          houseDot.className = 'house-dot';
          housesContainer.appendChild(houseDot);
        }
      }
    }

    // Update mortgage tag
    const mortgageTag = cellDiv.querySelector('.mortgage-tag');
    if (mortgageTag) {
      mortgageTag.style.display = prop.mortgaged ? 'block' : 'none';
    }

    // Update border and price tag
    const priceSpan = cellDiv.querySelector('.cell-price');
    if (prop.owner !== null) {
      const owner = state.players.find(p => p.id === prop.owner);
      if (owner) {
        cellDiv.style.border = `2px solid ${owner.color}`;
        cellDiv.style.boxShadow = `inset 0 0 6px ${owner.color}22`;
      }
      if (priceSpan) priceSpan.style.display = 'none';
    } else {
      cellDiv.style.border = '1px solid rgba(255, 255, 255, 0.05)';
      cellDiv.style.boxShadow = 'none';
      if (priceSpan) {
        priceSpan.style.display = 'block';
        priceSpan.innerText = `${prop.price}M`;
      }
    }
  });

  // Handle player tokens rendering and animation
  updateTokens(state);

  // Trigger landing property display if active
  if (state.currentTurnAction === 'handle_tile') {
    const activePlayer = state.players[state.turnIndex];
    if (!animatingPlayers.has(activePlayer.id)) {
      const prop = state.properties[activePlayer.position];
      if (prop && prop.owner === null && prop.price !== null) {
        showCenterOverlayCard({
          type: 'deed',
          prop: prop,
          isLanding: true
        });
      }
    }
  } else {
    if (currentOverlayType === 'deed-landing') {
      hideCenterOverlayCard();
    }
  }
}

function updateTokens(state) {
  const tokensLayer = document.getElementById('tokens-layer');
  if (!tokensLayer) return;

  state.players.forEach(p => {
    if (p.isBankrupt) {
      // Remove token if bankrupt
      if (playerTokens[p.id]) {
        playerTokens[p.id].remove();
        delete playerTokens[p.id];
        delete playerPositions[p.id];
      }
      return;
    }

    // Create token if it doesn't exist
    if (!playerTokens[p.id]) {
      const token = document.createElement('div');
      token.className = 'token';
      token.style.position = 'absolute';
      token.style.backgroundColor = p.color;
      token.style.boxShadow = `0 0 8px ${p.color}`;
      token.style.transition = 'top 0.25s ease-in-out, left 0.25s ease-in-out';
      
      tokensLayer.appendChild(token);
      playerTokens[p.id] = token;
      playerPositions[p.id] = p.position;
      
      updateTokenVisualPosition(p.id, state);
    }

    // Path animation check
    const currentVisualPos = playerPositions[p.id];
    const targetPos = p.position;

    if (currentVisualPos !== targetPos && !animatingPlayers.has(p.id)) {
      animatingPlayers.add(p.id);
      animatePlayerPath(p.id, currentVisualPos, targetPos, state);
    } else if (!animatingPlayers.has(p.id)) {
      // Sync static positions (offsets/resizing)
      updateTokenVisualPosition(p.id, state);
    }
  });
}

function getPlayerOffset(indexOnCell, totalOnCell) {
  if (totalOnCell <= 1) return { x: 0, y: 0 };
  const angle = (indexOnCell / totalOnCell) * Math.PI * 2;
  const radius = 8; // Offset radius in pixels
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function updateTokenVisualPosition(playerId, state) {
  const tokenEl = playerTokens[playerId];
  if (!tokenEl) return;

  const visualPos = playerPositions[playerId];
  const cellEl = document.querySelector(`.cell-${visualPos}`);
  if (!cellEl) return;

  const boardEl = document.getElementById('board');
  const boardRect = boardEl.getBoundingClientRect();
  const cellRect = cellEl.getBoundingClientRect();

  // Center coordinate of cell relative to board
  let x = cellRect.left - boardRect.left + cellRect.width / 2;
  let y = cellRect.top - boardRect.top + cellRect.height / 2;

  // Center token precisely (10px wide, so subtract 5px)
  x -= 5;
  y -= 5;

  // Add offset if multiple players share the cell
  const playersOnCell = state.players.filter(p => !p.isBankrupt && playerPositions[p.id] === visualPos);
  const index = playersOnCell.findIndex(p => p.id === playerId);
  
  if (playersOnCell.length > 1 && index !== -1) {
    const offset = getPlayerOffset(index, playersOnCell.length);
    x += offset.x;
    y += offset.y;
  }

  tokenEl.style.left = `${x}px`;
  tokenEl.style.top = `${y}px`;
}

function animatePlayerPath(playerId, start, end, state) {
  const path = [];
  let curr = start;
  while (curr !== end) {
    curr = (curr + 1) % 40;
    path.push(curr);
  }

  let stepIndex = 0;
  function step() {
    if (stepIndex >= path.length) {
      animatingPlayers.delete(playerId);
      playerPositions[playerId] = end;
      
      // Final sync for offsets
      state.players.forEach(p => {
        if (!p.isBankrupt && playerPositions[p.id] === end) {
          updateTokenVisualPosition(p.id, state);
        }
      });

      // Show landing card or pending drawn card now if the animation that finished belongs to the active player
      const activePlayer = state.players[state.turnIndex];
      if (activePlayer && playerId === activePlayer.id) {
        if (pendingOverlayCard) {
          showCenterOverlayCard(pendingOverlayCard);
          pendingOverlayCard = null;
        } else if (state.currentTurnAction === 'handle_tile') {
          const prop = state.properties[activePlayer.position];
          if (prop && prop.owner === null && prop.price !== null) {
            showCenterOverlayCard({
              type: 'deed',
              prop: prop,
              isLanding: true
            });
          }
        }
      }
      return;
    }

    const nextCell = path[stepIndex];
    playerPositions[playerId] = nextCell;
    updateTokenVisualPosition(playerId, state);
    
    // Play arpeggiated movement tone (rising pitch)
    const freq = 440 + (stepIndex * 40);
    SoundSystem.playTone(freq, 0.05, 'triangle');

    stepIndex++;
    setTimeout(step, 280); // step speed matching transition
  }

  step();
}

// Render dynamic player actions & buttons
function renderControls(state) {
  const activePlayer = state.players[state.turnIndex];
  const localPlayer = state.players.find(p => p.id === localPlayerId);

  // Hide all initially
  document.getElementById('btn-roll-dice').style.display = 'none';
  document.getElementById('btn-buy-prop').style.display = 'none';
  document.getElementById('btn-decline-prop').style.display = 'none';
  document.getElementById('btn-pay-fine').style.display = 'none';
  document.getElementById('btn-use-jailcard').style.display = 'none';
  document.getElementById('btn-pay-debt').style.display = 'none';
  document.getElementById('btn-manual-bankrupt').style.display = 'none';
  document.getElementById('btn-end-turn').style.display = 'none';
  document.getElementById('action-helper-text').innerText = '';

  if (!localPlayer) return;

  // Turn tag
  const indicator = document.getElementById('turn-indicator');
  indicator.innerText = `TURNO: ${activePlayer.username}`;
  indicator.style.backgroundColor = activePlayer.color;

  // Show Trade proposer trigger if not bankrupt
  document.getElementById('btn-open-trade').style.disabled = localPlayer.isBankrupt;

  // If game ended, no actions
  if (state.status === 'ended') {
    document.getElementById('action-helper-text').innerText = 'Partida Finalizada.';
    return;
  }

  // It's local player's turn
  if (activePlayer.id === localPlayerId) {
    if (state.currentTurnAction === 'roll') {
      if (localPlayer.inJail) {
        document.getElementById('btn-roll-dice').style.display = 'block';
        document.getElementById('btn-roll-dice').innerText = '🎲 Lanzar para Dobles';
        document.getElementById('btn-pay-fine').style.display = 'block';
        if (localPlayer.getOutOfJailCards > 0) {
          document.getElementById('btn-use-jailcard').style.display = 'block';
        }
      } else {
        document.getElementById('btn-roll-dice').style.display = 'block';
        document.getElementById('btn-roll-dice').innerText = '🎲 Tirar Dados';
      }
    } else if (state.currentTurnAction === 'handle_tile') {
      const tile = state.properties[localPlayer.position];
      if (tile.owner === null && tile.price !== null) {
        document.getElementById('btn-buy-prop').style.display = 'block';
        document.getElementById('buy-price-val').innerText = tile.price;
        document.getElementById('btn-decline-prop').style.display = 'block';
      }
    } else if (state.currentTurnAction === 'bankrupt_or_pay') {
      document.getElementById('btn-pay-debt').style.display = 'block';
      document.getElementById('btn-pay-debt').innerText = `💵 Pagar Deuda (${state.debtAmount}M)`;
      document.getElementById('btn-manual-bankrupt').style.display = 'block';
      document.getElementById('action-helper-text').innerText = `Debes pagar ${state.debtAmount}M. Si no tienes liquidez, hipoteca propiedades o vende casas en el panel inferior.`;
    } else if (state.currentTurnAction === 'ended_action') {
      document.getElementById('btn-end-turn').style.display = 'block';
    }
  } else {
    // Other player's turn
    document.getElementById('action-helper-text').innerText = `Esperando a ${activePlayer.username}...`;
    // Allow bankruptcy at any time if balance is negative (though usually only triggered on turn debt, lets allow manual bankruptcy option if they feel stuck)
    if (localPlayer.money < 0) {
      document.getElementById('btn-manual-bankrupt').style.display = 'block';
    }
  }
}

// Render player rows
function renderPlayersList(state) {
  const container = document.getElementById('players-list');
  container.innerHTML = '';
  
  state.players.forEach(p => {
    const row = document.createElement('div');
    row.className = `player-row`;
    if (p.id === selectedPlayerId) row.classList.add('selected');
    if (p.id === state.players[state.turnIndex].id) row.classList.add('active-turn');
    
    // Flags
    let flagsHtml = '';
    if (p.inJail) flagsHtml += `<span class="flag flag-jail">CÁRCEL</span>`;
    if (p.isBankrupt) flagsHtml += `<span class="flag flag-bankrupt">BANCARROTA</span>`;
    
    row.innerHTML = `
      <div class="player-info-meta">
        <div class="player-color-dot" style="background-color: ${p.color};"></div>
        <span class="player-name-val">${p.username} ${p.id === localPlayerId ? '(Tú)' : ''}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="player-status-flags">${flagsHtml}</div>
        <span class="player-money-val">${p.money}M</span>
      </div>
    `;
    
    row.addEventListener('click', () => {
      selectedPlayerId = p.id;
      renderPlayersList(state);
      renderPropertiesDeck(state);
    });
    
    container.appendChild(row);
  });
}

// Render properties owned by selected player in dashboard
function renderPropertiesDeck(state) {
  const container = document.getElementById('properties-grid');
  container.innerHTML = '';

  const player = state.players.find(p => p.id === selectedPlayerId);
  const localPlayer = state.players.find(p => p.id === localPlayerId);
  
  if (!player) {
    container.innerHTML = '<p class="placeholder-text">Selecciona un jugador para ver sus propiedades.</p>';
    return;
  }

  // Display name header
  document.getElementById('selected-player-name').innerText = player.id === localPlayerId ? 'Tus Propiedades' : player.username;

  // Toggle Trade button visibility (only trade with other non-bankrupt players)
  const tradeBtn = document.getElementById('btn-open-trade');
  if (player.id !== localPlayerId && !player.isBankrupt && !localPlayer.isBankrupt) {
    tradeBtn.style.display = 'block';
  } else {
    tradeBtn.style.display = 'none';
  }

  const props = state.properties.filter(p => p.owner === player.id);
  if (props.length === 0) {
    container.innerHTML = `<p class="placeholder-text">${player.username} no posee propiedades.</p>`;
    return;
  }

  props.forEach(prop => {
    const card = document.createElement('div');
    card.className = `property-deed-card`;
    if (prop.mortgaged) card.classList.add('mortgaged');

    const colorHeader = document.createElement('div');
    colorHeader.className = `deed-color-header`;
    colorHeader.style.backgroundColor = prop.color ? `var(--color-${prop.color})` : '#555';

    let housesText = '';
    if (prop.type === 'property') {
      if (prop.houses === 5) housesText = 'Hotel';
      else if (prop.houses > 0) housesText = `${prop.houses} Casa${prop.houses > 1 ? 's' : ''}`;
      else housesText = 'Sin edificar';
    } else if (prop.type === 'transport') {
      housesText = 'Transporte';
    } else if (prop.type === 'service') {
      housesText = 'Servicio';
    }

    card.innerHTML = `
      <div class="deed-title">${prop.name}</div>
      <div class="deed-houses-info">${housesText} ${prop.mortgaged ? '(Hipotecada)' : ''}</div>
    `;
    card.insertBefore(colorHeader, card.firstChild);

    card.innerHTML = `
      <div class="deed-title">${prop.name}</div>
      <div class="deed-houses-info">${housesText} ${prop.mortgaged ? '(Hipotecada)' : ''}</div>
    `;
    card.insertBefore(colorHeader, card.firstChild);

    // Show deed details in center on click
    card.addEventListener('click', () => {
      showCenterOverlayCard({
        type: 'deed',
        prop: prop,
        isLanding: false
      });
    });

    container.appendChild(card);
  });
}

// Render logs list
function renderLogs(state) {
  const container = document.getElementById('game-logs');
  const shouldScroll = container.scrollHeight - container.clientHeight <= container.scrollTop + 30;
  
  container.innerHTML = '';
  state.logs.forEach(log => {
    const div = document.createElement('div');
    div.innerText = log;
    container.appendChild(div);
  });

  if (shouldScroll || currentGameState === state) {
    container.scrollTop = container.scrollHeight;
  }
}

// ----------------------------------------------------
// AUCTION TIMER & ACTIONS
// ----------------------------------------------------

function renderAuctionModal(state) {
  const modal = document.getElementById('modal-auction');
  const auction = state.auction;

  if (!auction.active) {
    modal.classList.remove('active');
    return;
  }

  // Set active
  modal.classList.add('active');

  const prop = state.properties.find(p => p.id === auction.propertyId);
  const highestBidder = state.players.find(p => p.id === auction.highestBidder);

  // Property info
  document.getElementById('auc-card-name').innerText = prop.name;
  document.getElementById('auc-card-value').innerText = prop.price;
  document.getElementById('auc-card-header').style.backgroundColor = prop.color ? `var(--color-${prop.color})` : '#555';

  // Auction details
  document.getElementById('auction-timer').innerText = auction.timeLeft;
  document.getElementById('auction-highest-bid').innerText = `${auction.currentBid}M`;
  document.getElementById('auction-highest-bidder').innerText = highestBidder ? highestBidder.username : 'Nadie';

  // Toggle timer border color
  const timerCircle = document.getElementById('auction-timer');
  if (auction.timeLeft <= 5) {
    timerCircle.style.borderColor = 'var(--neon-pink)';
    timerCircle.style.boxShadow = '0 0 15px var(--neon-pink)';
  } else {
    timerCircle.style.borderColor = 'var(--neon-green)';
    timerCircle.style.boxShadow = '0 0 15px var(--neon-green)';
  }
}

// Quick bid buttons
document.getElementById('btn-bid-10').addEventListener('click', () => submitBidOffset(10));
document.getElementById('btn-bid-50').addEventListener('click', () => submitBidOffset(50));
document.getElementById('btn-bid-100').addEventListener('click', () => submitBidOffset(100));

document.getElementById('btn-bid-custom').addEventListener('click', () => {
  const val = parseInt(document.getElementById('input-custom-bid').value);
  if (isNaN(val) || val <= 0) return showToast('Introduce un número de puja válido', true);
  socket.emit('submitBid', { bidAmount: val });
  document.getElementById('input-custom-bid').value = '';
});

function submitBidOffset(offset) {
  if (currentGameState && currentGameState.auction.active) {
    const nextBid = currentGameState.auction.currentBid + offset;
    socket.emit('submitBid', { bidAmount: nextBid });
  }
}

// ----------------------------------------------------
// TRADE / NEGOTIATIONS SYSTEM
// ----------------------------------------------------

const tradeModal = document.getElementById('modal-trade');

document.getElementById('btn-open-trade').addEventListener('click', () => {
  // Opening negotiation dialog with selectedPlayerId
  openTradeDialog(selectedPlayerId, false);
});

document.getElementById('close-trade-modal').addEventListener('click', () => {
  if (currentGameState && currentGameState.trade.active) {
    if (currentGameState.trade.senderId === localPlayerId || currentGameState.trade.receiverId === localPlayerId) {
      socket.emit('rejectTrade');
    }
  }
  tradeModal.classList.remove('active');
});

function openTradeDialog(counterpartId, isReadOnly = false, tradeState = null) {
  const state = currentGameState;
  const localPlayer = state.players.find(p => p.id === localPlayerId);
  if (!localPlayer) return;

  tradeModal.classList.add('active');

  let proposer, receiver;
  if (tradeState) {
    proposer = state.players.find(p => p.id === tradeState.senderId);
    receiver = state.players.find(p => p.id === tradeState.receiverId);
  } else {
    proposer = localPlayer;
    receiver = state.players.find(p => p.id === counterpartId);
  }

  if (!proposer || !receiver) return;

  // Titles
  document.getElementById('trade-modal-title').innerText = isReadOnly ? `🤝 Trato de ${proposer.username}` : `🤝 Proponer Trato a ${receiver.username}`;
  
  const senderTitleEl = document.getElementById('trade-sender-title');
  const receiverTitleEl = document.getElementById('trade-receiver-title');
  if (isReadOnly) {
    senderTitleEl.innerText = `Lo que ofrece ${proposer.username}`;
    receiverTitleEl.innerText = `Lo que ofrece ${receiver.username}`;
  } else {
    senderTitleEl.innerText = 'Tus Ofrecimientos';
    receiverTitleEl.innerText = `Peticiones a ${receiver.username}`;
  }

  // Reset inputs
  const offerMoneyInput = document.getElementById('trade-offer-money');
  const requestMoneyInput = document.getElementById('trade-request-money');

  offerMoneyInput.disabled = isReadOnly;
  requestMoneyInput.disabled = isReadOnly;

  if (tradeState) {
    offerMoneyInput.value = tradeState.senderOffer.money;
    requestMoneyInput.value = tradeState.receiverOffer.money;
  } else {
    offerMoneyInput.value = 0;
    requestMoneyInput.value = 0;
  }

  // Left column: Proposer (Sender) offerings
  const proposerPropsList = document.getElementById('trade-offer-properties-list');
  proposerPropsList.innerHTML = '';
  
  if (isReadOnly) {
    const offeredProps = tradeState ? tradeState.senderOffer.properties : [];
    const offeredJailCards = tradeState ? tradeState.senderOffer.jailCards : 0;
    
    if (offeredProps.length === 0 && offeredJailCards === 0) {
      proposerPropsList.innerHTML = '<p class="placeholder-text" style="font-size:0.8rem; color: var(--text-secondary); text-align: center; margin-top: 15px;">Ninguna propiedad ni carta</p>';
    } else {
      offeredProps.forEach(propId => {
        const prop = state.properties.find(p => p.id === propId);
        if (prop) {
          const div = document.createElement('div');
          div.className = 'trade-item-view';
          div.innerHTML = `
            <div class="trade-prop-color-indicator" style="background-color: var(--color-${prop.color || 'gray'});"></div>
            <span>${prop.name} ${prop.mortgaged ? '(Hipotecada)' : ''}</span>
          `;
          proposerPropsList.appendChild(div);
        }
      });
      if (offeredJailCards > 0) {
        const div = document.createElement('div');
        div.className = 'trade-item-view';
        div.innerHTML = `
          <div class="trade-prop-color-indicator" style="background-color: var(--neon-pink); box-shadow: 0 0 5px var(--neon-pink);"></div>
          <span>✉ ${offeredJailCards} Tarjeta(s) Cárcel</span>
        `;
        proposerPropsList.appendChild(div);
      }
    }
  } else {
    const proposerProps = state.properties.filter(p => p.owner === proposer.id);
    if (proposerProps.length === 0 && proposer.getOutOfJailCards === 0) {
      proposerPropsList.innerHTML = '<p class="placeholder-text" style="font-size:0.7rem;">Sin propiedades ni cartas</p>';
    } else {
      proposerProps.forEach(prop => {
        const isChecked = tradeState && tradeState.senderOffer.properties.includes(prop.id);
        const label = document.createElement('label');
        label.className = 'trade-prop-checkbox-label';
        label.innerHTML = `
          <input type="checkbox" value="${prop.id}" ${isChecked ? 'checked' : ''}>
          <div class="trade-prop-color-indicator" style="background-color: var(--color-${prop.color || 'gray'});"></div>
          <span>${prop.name} ${prop.mortgaged ? '(H)' : ''}</span>
        `;
        proposerPropsList.appendChild(label);
      });

      if (proposer.getOutOfJailCards > 0) {
        for (let i = 0; i < proposer.getOutOfJailCards; i++) {
          const isChecked = tradeState && tradeState.senderOffer.jailCards > i;
          const label = document.createElement('label');
          label.className = 'trade-prop-checkbox-label';
          label.innerHTML = `
            <input type="checkbox" data-type="jailcard" value="1" ${isChecked ? 'checked' : ''}>
            <div class="trade-prop-color-indicator" style="background-color: var(--neon-pink); box-shadow: 0 0 5px var(--neon-pink);"></div>
            <span>✉ Tarjeta Cárcel #${i+1}</span>
          `;
          proposerPropsList.appendChild(label);
        }
      }
    }
  }

  // Right column: Receiver offerings
  const receiverPropsList = document.getElementById('trade-request-properties-list');
  receiverPropsList.innerHTML = '';
  
  if (isReadOnly) {
    const requestedProps = tradeState ? tradeState.receiverOffer.properties : [];
    const requestedJailCards = tradeState ? tradeState.receiverOffer.jailCards : 0;
    
    if (requestedProps.length === 0 && requestedJailCards === 0) {
      receiverPropsList.innerHTML = '<p class="placeholder-text" style="font-size:0.8rem; color: var(--text-secondary); text-align: center; margin-top: 15px;">Ninguna propiedad ni carta</p>';
    } else {
      requestedProps.forEach(propId => {
        const prop = state.properties.find(p => p.id === propId);
        if (prop) {
          const div = document.createElement('div');
          div.className = 'trade-item-view';
          div.innerHTML = `
            <div class="trade-prop-color-indicator" style="background-color: var(--color-${prop.color || 'gray'});"></div>
            <span>${prop.name} ${prop.mortgaged ? '(Hipotecada)' : ''}</span>
          `;
          receiverPropsList.appendChild(div);
        }
      });
      if (requestedJailCards > 0) {
        const div = document.createElement('div');
        div.className = 'trade-item-view';
        div.innerHTML = `
          <div class="trade-prop-color-indicator" style="background-color: var(--neon-pink); box-shadow: 0 0 5px var(--neon-pink);"></div>
          <span>✉ ${requestedJailCards} Tarjeta(s) Cárcel</span>
        `;
        receiverPropsList.appendChild(div);
      }
    }
  } else {
    const receiverProps = state.properties.filter(p => p.owner === receiver.id);
    if (receiverProps.length === 0 && receiver.getOutOfJailCards === 0) {
      receiverPropsList.innerHTML = '<p class="placeholder-text" style="font-size:0.7rem;">Sin propiedades ni cartas</p>';
    } else {
      receiverProps.forEach(prop => {
        const isChecked = tradeState && tradeState.receiverOffer.properties.includes(prop.id);
        const label = document.createElement('label');
        label.className = 'trade-prop-checkbox-label';
        label.innerHTML = `
          <input type="checkbox" value="${prop.id}" ${isChecked ? 'checked' : ''}>
          <div class="trade-prop-color-indicator" style="background-color: var(--color-${prop.color || 'gray'});"></div>
          <span>${prop.name} ${prop.mortgaged ? '(H)' : ''}</span>
        `;
        receiverPropsList.appendChild(label);
      });

      if (receiver.getOutOfJailCards > 0) {
        for (let i = 0; i < receiver.getOutOfJailCards; i++) {
          const isChecked = tradeState && tradeState.receiverOffer.jailCards > i;
          const label = document.createElement('label');
          label.className = 'trade-prop-checkbox-label';
          label.innerHTML = `
            <input type="checkbox" data-type="jailcard" value="1" ${isChecked ? 'checked' : ''}>
            <div class="trade-prop-color-indicator" style="background-color: var(--neon-pink); box-shadow: 0 0 5px var(--neon-pink);"></div>
            <span>✉ Tarjeta Cárcel #${i+1}</span>
          `;
          receiverPropsList.appendChild(label);
        }
      }
    }
  }

  // Buttons configurations
  const sendBtn = document.getElementById('btn-send-trade-offer');
  const responsePanel = document.getElementById('trade-response-actions');

  if (isReadOnly) {
    sendBtn.style.display = 'none';
    responsePanel.style.display = 'block';
  } else {
    sendBtn.style.display = 'block';
    responsePanel.style.display = 'none';
    
    // Clear old event listener by replacing button
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    
    newSendBtn.addEventListener('click', () => {
      // Gather inputs
      const senderOffer = {
        money: parseInt(offerMoneyInput.value) || 0,
        jailCards: Array.from(proposerPropsList.querySelectorAll('input[data-type="jailcard"]:checked')).length,
        properties: Array.from(proposerPropsList.querySelectorAll('input:not([data-type="jailcard"]):checked')).map(cb => parseInt(cb.value))
      };
      const receiverOffer = {
        money: parseInt(requestMoneyInput.value) || 0,
        jailCards: Array.from(receiverPropsList.querySelectorAll('input[data-type="jailcard"]:checked')).length,
        properties: Array.from(receiverPropsList.querySelectorAll('input:not([data-type="jailcard"]):checked')).map(cb => parseInt(cb.value))
      };

      if (senderOffer.money < 0 || receiverOffer.money < 0) {
        return showToast('El dinero no puede ser negativo', true);
      }
      if (senderOffer.money > proposer.money) {
        return showToast('No tienes suficiente dinero para ofrecer', true);
      }
      if (receiverOffer.money > receiver.money) {
        return showToast(`El receptor no tiene suficiente dinero (${receiver.money}M)`, true);
      }

      socket.emit('proposeTrade', {
        receiverId: receiver.id,
        senderOffer,
        receiverOffer
      });
      tradeModal.classList.remove('active');
    });
  }
}

function renderTradeModal(state) {
  const trade = state.trade;
  
  if (!trade.active) {
    // If not active, make sure modal is closed (unless we are preparing one)
    const isProposing = document.getElementById('btn-send-trade-offer').style.display === 'block';
    if (!isProposing) {
      tradeModal.classList.remove('active');
    }
    return;
  }

  // Active trade
  if (trade.receiverId === localPlayerId) {
    // We are the receiver: show read-only with accept/counter/reject
    openTradeDialog(trade.senderId, true, trade);
  } else if (trade.senderId === localPlayerId) {
    // We are the sender: show waiting dialog (disabled inputs, no buttons, waiting overlay)
    openTradeDialog(trade.receiverId, true, trade);
    document.getElementById('trade-modal-title').innerText = `⏳ Esperando respuesta de trato...`;
    document.getElementById('trade-response-actions').style.display = 'none';
  } else {
    // Spectator mode: show trade details in read-only without response action buttons
    openTradeDialog(trade.receiverId, true, trade);
    const sender = state.players.find(p => p.id === trade.senderId);
    const receiver = state.players.find(p => p.id === trade.receiverId);
    const senderName = sender ? sender.username : 'Jugador';
    const receiverName = receiver ? receiver.username : 'Jugador';
    document.getElementById('trade-modal-title').innerText = `🤝 Trato propuesto: ${senderName} ➔ ${receiverName}`;
    document.getElementById('trade-response-actions').style.display = 'none';
  }
}

// Trade receiver actions
document.getElementById('btn-accept-trade').addEventListener('click', () => {
  socket.emit('acceptTrade');
});

document.getElementById('btn-reject-trade').addEventListener('click', () => {
  socket.emit('rejectTrade');
});

document.getElementById('btn-counter-trade').addEventListener('click', () => {
  // Let receiver modify and submit a counter offer
  const trade = currentGameState.trade;
  openTradeDialog(trade.senderId, false, trade);
  
  // Alter send button to perform counter offer instead
  const sendBtn = document.getElementById('btn-send-trade-offer');
  sendBtn.innerText = 'Enviar Contraoferta';
  
  const newSendBtn = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

  newSendBtn.addEventListener('click', () => {
    const offerMoneyInput = document.getElementById('trade-offer-money');
    const requestMoneyInput = document.getElementById('trade-request-money');
    
    const proposerPropsList = document.getElementById('trade-offer-properties-list');
    const counterpartPropsList = document.getElementById('trade-request-properties-list');

    const senderOffer = {
      money: parseInt(offerMoneyInput.value) || 0,
      jailCards: Array.from(proposerPropsList.querySelectorAll('input[data-type="jailcard"]:checked')).length,
      properties: Array.from(proposerPropsList.querySelectorAll('input:not([data-type="jailcard"]):checked')).map(cb => parseInt(cb.value))
    };
    const receiverOffer = {
      money: parseInt(requestMoneyInput.value) || 0,
      jailCards: Array.from(counterpartPropsList.querySelectorAll('input[data-type="jailcard"]:checked')).length,
      properties: Array.from(counterpartPropsList.querySelectorAll('input:not([data-type="jailcard"]):checked')).map(cb => parseInt(cb.value))
    };

    socket.emit('counterTrade', { senderOffer, receiverOffer });
  });
});

// ----------------------------------------------------
// DIRECT GAMEPLAY SOCKET EMITTERS
// ----------------------------------------------------

document.getElementById('btn-roll-dice').addEventListener('click', () => {
  const d1 = document.getElementById('die-1');
  const d2 = document.getElementById('die-2');
  if (d1 && d2) {
    d1.classList.add('rolling');
    d2.classList.add('rolling');
  }
  socket.emit('rollDice');
});

document.getElementById('btn-buy-prop').addEventListener('click', () => {
  socket.emit('buyProperty');
});

document.getElementById('btn-decline-prop').addEventListener('click', () => {
  socket.emit('declineProperty');
});

document.getElementById('btn-pay-fine').addEventListener('click', () => {
  socket.emit('payJailFine');
});

document.getElementById('btn-use-jailcard').addEventListener('click', () => {
  socket.emit('useJailCard');
});

document.getElementById('btn-pay-debt').addEventListener('click', () => {
  socket.emit('payDebt');
});

document.getElementById('btn-manual-bankrupt').addEventListener('click', () => {
  if (confirm('¿Estás seguro de que quieres declararte en Bancarrota? Esta acción es irreversible y cederá tus bienes.')) {
    socket.emit('declareBankrupt');
  }
});

document.getElementById('btn-end-turn').addEventListener('click', () => {
  socket.emit('endTurn');
});

document.getElementById('btn-leave-game').addEventListener('click', () => {
  if (confirm('¿Estás seguro de que quieres abandonar la partida? Perderás tus bienes y tu progreso.')) {
    if (currentGameState && currentGameState.status === 'playing') {
      socket.emit('declareBankrupt');
    }
    localStorage.removeItem('monopoly_room_id');
    setTimeout(() => {
      window.location.reload();
    }, 150);
  }
});

// Window resize listener to keep tokens correctly positioned over their cells
window.addEventListener('resize', () => {
  if (currentGameState && currentGameState.status === 'playing') {
    currentGameState.players.forEach(p => {
      if (!p.isBankrupt && playerTokens[p.id] && !animatingPlayers.has(p.id)) {
        updateTokenVisualPosition(p.id, currentGameState);
      }
    });
  }
});

// ----------------------------------------------------
// CENTER OVERLAY CARD SYSTEM
// ----------------------------------------------------

function showCenterOverlayCard(data) {
  const activePlayer = currentGameState ? currentGameState.players[currentGameState.turnIndex] : null;
  if (activePlayer && animatingPlayers.has(activePlayer.id) && (data.isLanding || data.type === 'card')) {
    pendingOverlayCard = data;
    return;
  }

  const overlay = document.getElementById('center-overlay-card');
  const content = document.getElementById('overlay-card-content');
  const closeBtn = document.getElementById('close-overlay-card');
  
  if (!overlay || !content) return;

  currentOverlayType = data.type === 'card' ? 'card' : (data.isLanding ? 'deed-landing' : 'deed-inspect');
  
  if (data.type === 'card') {
    closeBtn.style.display = 'none';
    const titleColor = data.title === 'SUERTE' ? 'var(--neon-orange)' : 'var(--neon-pink)';
    content.innerHTML = `
      <div style="border: 2px solid ${titleColor}; box-shadow: 0 0 15px ${titleColor}; padding: 16px; border-radius: 10px; background: rgba(0,0,0,0.8); max-width: 250px; width: 90%; text-align: center;">
        <h3 style="color: ${titleColor}; text-shadow: 0 0 8px ${titleColor}; font-weight: 800; margin-bottom: 12px; font-size: 1.2rem;">${data.title}</h3>
        <p style="font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 8px;">Jugador: <strong>${data.player}</strong></p>
        <div style="margin: 15px 0; color: #fff; font-size: 0.85rem; line-height: 1.4; text-shadow: 0 0 5px rgba(255,255,255,0.2);">${data.text}</div>
        <button id="btn-dismiss-overlay" class="btn btn-primary btn-mini" style="margin-top: 10px; width:100%;">Entendido</button>
      </div>
    `;
    document.getElementById('btn-dismiss-overlay').addEventListener('click', () => {
      hideCenterOverlayCard();
    });
  } else if (data.type === 'deed') {
    const prop = data.prop;
    const isLanding = data.isLanding;
    closeBtn.style.display = isLanding ? 'none' : 'block';

    const headerColor = prop.color ? `var(--color-${prop.color})` : 'var(--neon-blue)';
    const svgIcon = getSVGIconHtml(prop);

    let detailsHtml = '';
    if (prop.type === 'property') {
      detailsHtml = `
        <div class="deed-rent-row"><span>Solar sin casa:</span> <strong>${prop.rentProgress[0]}M</strong></div>
        <div class="deed-rent-row"><span>Monopolio (x2):</span> <strong>${prop.rentProgress[0]*2}M</strong></div>
        <div class="deed-rent-row"><span>Con 1 Casa:</span> <strong>${prop.rentProgress[1]}M</strong></div>
        <div class="deed-rent-row"><span>Con 2 Casas:</span> <strong>${prop.rentProgress[2]}M</strong></div>
        <div class="deed-rent-row"><span>Con 3 Casas:</span> <strong>${prop.rentProgress[3]}M</strong></div>
        <div class="deed-rent-row"><span>Con 4 Casas:</span> <strong>${prop.rentProgress[4]}M</strong></div>
        <div class="deed-rent-row neon-pink-glow"><span>Con Hotel:</span> <strong>${prop.rentProgress[5]}M</strong></div>
        <div class="deed-cost-row" style="margin-top: 6px; font-size: 0.7rem; border-top: 1px solid var(--border-glass); padding-top: 6px;">
          Cada casa/hotel cuesta: <strong>${prop.housePrice}M</strong>
        </div>
      `;
    } else if (prop.type === 'transport') {
      detailsHtml = `
        <div class="deed-rent-row"><span>1 propiedad:</span> <strong>25M</strong></div>
        <div class="deed-rent-row"><span>2 propiedades:</span> <strong>50M</strong></div>
        <div class="deed-rent-row"><span>3 propiedades:</span> <strong>100M</strong></div>
        <div class="deed-rent-row"><span>4 propiedades:</span> <strong>200M</strong></div>
      `;
    } else if (prop.type === 'service') {
      detailsHtml = `
        <div class="deed-rent-row"><span>1 Servicio:</span> <strong>4x dados</strong></div>
        <div class="deed-rent-row"><span>2 Servicios:</span> <strong>10x dados</strong></div>
      `;
    }

    let ownerText = '';
    if (prop.owner !== null) {
      const owner = currentGameState ? currentGameState.players.find(p => p.id === prop.owner) : null;
      if (owner) {
        ownerText = `<div style="font-size: 0.7rem; color: ${owner.color}; font-weight: 600; margin-bottom: 4px;">Propietario: ${owner.username} ${owner.id === localPlayerId ? '(Tú)' : ''}</div>`;
      }
    } else {
      ownerText = `<div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 4px;">Sin propietario (Banca)</div>`;
    }

    let opsHtml = '';
    if (prop.owner === localPlayerId && !isLanding) {
      const player = currentGameState ? currentGameState.players.find(p => p.id === localPlayerId) : null;
      if (player && !player.isBankrupt) {
        opsHtml += `<div class="deed-overlay-ops" style="display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 10px; border-top: 1px solid var(--border-glass); padding-top: 10px;">`;
        
        if (prop.type === 'property' && !prop.mortgaged) {
          if (prop.houses < 5) {
            opsHtml += `<button id="overlay-btn-build" class="btn btn-success btn-mini" style="width: 100%; font-size: 0.7rem; padding: 6px; min-height: 32px;">🏠 Edificar Casa (-${prop.housePrice}M)</button>`;
          }
          if (prop.houses > 0) {
            opsHtml += `<button id="overlay-btn-sell" class="btn btn-warning btn-mini" style="width: 100%; font-size: 0.7rem; padding: 6px; min-height: 32px;">🪙 Vender Casa (+${Math.floor(prop.housePrice / 2)}M)</button>`;
          }
        }
        
        if (!prop.mortgaged && prop.houses === 0) {
          opsHtml += `<button id="overlay-btn-mortgage" class="btn btn-danger btn-mini" style="width: 100%; font-size: 0.7rem; padding: 6px; min-height: 32px;">🏦 Hipotecar (+${Math.floor(prop.price / 2)}M)</button>`;
        } else if (prop.mortgaged) {
          const cost = Math.floor(Math.floor(prop.price / 2) * 1.1);
          opsHtml += `<button id="overlay-btn-unmortgage" class="btn btn-success btn-mini" style="width: 100%; font-size: 0.7rem; padding: 6px; min-height: 32px;">🔓 Deshipotecar (-${cost}M)</button>`;
        }
        
        opsHtml += `</div>`;
      }
    }

    activePropertyId = prop.id;

    content.innerHTML = `
      <div style="border: 2px solid ${headerColor}; box-shadow: 0 0 15px ${headerColor}55; border-radius: 10px; width: min(220px, 100%); background: rgba(13, 17, 39, 0.98); overflow: hidden; display: flex; flex-direction: column; text-align: center;">
        <div style="background-color: ${headerColor}; padding: 8px; color: #fff; font-weight: 800; font-size: 0.8rem; text-shadow: 0 1px 2px #000; text-transform: uppercase;">
          ${prop.type === 'property' ? 'Propiedad de Ciudad' : prop.type === 'transport' ? 'Transporte' : 'Servicio Público'}
        </div>
        <div style="padding: 10px; display: flex; flex-direction: column; gap: 6px; align-items: center;">
          <h4 style="font-size: 1rem; font-weight: 800; color: #fff; margin-bottom: 2px;">${prop.name}</h4>
          
          <div style="margin: 4px 0;">${svgIcon}</div>

          <div style="font-size: 0.8rem; color: var(--neon-green); font-weight: 800; margin-bottom: 6px;">Precio: ${prop.price}M</div>
          
          ${ownerText}
          ${prop.mortgaged ? '<div style="font-size: 0.75rem; color: var(--neon-pink); font-weight: 800; text-shadow: 0 0 5px var(--neon-pink); margin-bottom: 4px;">HIPOTECADA</div>' : ''}

          <div style="text-align: left; width: 100%; font-size: 0.68rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 2px;">
            ${detailsHtml}
          </div>
          
          <div style="font-size: 0.6rem; color: var(--text-secondary); margin-top: 4px; border-top: 1px dashed var(--border-glass); width: 100%; padding-top: 4px;">
            Valor Hipoteca: <strong>${Math.floor(prop.price / 2)}M</strong>
          </div>
          
          ${opsHtml}
        </div>
      </div>
    `;

    // Attach listeners
    const bBuild = document.getElementById('overlay-btn-build');
    if (bBuild) bBuild.addEventListener('click', () => socket.emit('buildHouse', { propertyId: prop.id }));
    const bSell = document.getElementById('overlay-btn-sell');
    if (bSell) bSell.addEventListener('click', () => socket.emit('sellHouse', { propertyId: prop.id }));
    const bMortgage = document.getElementById('overlay-btn-mortgage');
    if (bMortgage) bMortgage.addEventListener('click', () => socket.emit('mortgageProperty', { propertyId: prop.id }));
    const bUnmortgage = document.getElementById('overlay-btn-unmortgage');
    if (bUnmortgage) bUnmortgage.addEventListener('click', () => socket.emit('unmortgageProperty', { propertyId: prop.id }));
  }
  
  overlay.style.display = 'flex';
}

function hideCenterOverlayCard() {
  const overlay = document.getElementById('center-overlay-card');
  if (overlay) {
    overlay.style.display = 'none';
  }
  currentOverlayType = null;
  activePropertyId = null;
}

function refreshCenterOverlayCard() {
  if (currentOverlayType === 'deed-inspect' && activePropertyId !== null && currentGameState) {
    const prop = currentGameState.properties.find(p => p.id === activePropertyId);
    if (prop) {
      showCenterOverlayCard({
        type: 'deed',
        prop: prop,
        isLanding: false
      });
    } else {
      hideCenterOverlayCard();
    }
  }
}

function getSVGIconHtml(prop) {
  const color = prop.color ? `var(--color-${prop.color})` : 'var(--neon-blue)';
  if (prop.type === 'transport') {
    return `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px ${color})">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.7 16 10 16 10l-2-3H5c-.6 0-1 .4-1 1v6c0 1.1.9 2 2 2h2m0 0c0 1.1.9 2 2 2s2-.9 2-2m-4 0c0 1.1-.9 2-2 2s-2-.9-2-2m8 0c0 1.1.9 2 2 2s2-.9 2-2" />
    </svg>`;
  } else if (prop.type === 'service') {
    if (prop.name === 'Discord') {
      return `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px ${color})">
        <path d="M18 8a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8Z"/>
        <circle cx="10" cy="12" r="1.2" fill="${color}"/>
        <circle cx="14" cy="12" r="1.2" fill="${color}"/>
      </svg>`;
    } else {
      return `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px ${color})">
        <rect width="14" height="14" x="5" y="6" rx="2" ry="2"/>
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
        <line x1="12" x2="12" y1="10" y2="16"/>
      </svg>`;
    }
  } else {
    return `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px ${color})">
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
    </svg>`;
  }
}

// Socket listener for drawn cards
socket.on('cardDrawn', ({ title, text, player }) => {
  showCenterOverlayCard({
    type: 'card',
    title,
    text,
    player
  });
  SoundSystem.playCard();
});

// Close overlay handler
document.getElementById('close-overlay-card').addEventListener('click', () => {
  hideCenterOverlayCard();
});

function animateDice(d1, d2) {
  const die1 = document.getElementById('die-1');
  const die2 = document.getElementById('die-2');
  if (!die1 || !die2) return;

  die1.classList.add('rolling');
  die2.classList.add('rolling');

  let rolls = 0;
  const interval = setInterval(() => {
    die1.innerText = Math.floor(Math.random() * 6) + 1;
    die2.innerText = Math.floor(Math.random() * 6) + 1;
    rolls++;
    if (rolls > 6) {
      clearInterval(interval);
      die1.classList.remove('rolling');
      die2.classList.remove('rolling');
      die1.innerText = d1;
      die2.innerText = d2;
    }
  }, 80);
}
