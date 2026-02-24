import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// PASTE YOUR FIREBASE CONFIGURATION HERE
const firebaseConfig = {
  apiKey: "AIzaSyDJTX2FXoNbsJvoLoYmgDtXzYsKem4rYWE",
  authDomain: "goainitiative.firebaseapp.com",
  databaseURL: "https://goainitiative-default-rtdb.firebaseio.com",
  projectId: "goainitiative",
  storageBucket: "goainitiative.firebasestorage.app",
  messagingSenderId: "447333808415",
  appId: "1:447333808415:web:46c4acd8193a7b76b4982a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const coinDisplay = document.getElementById('coin-display');
const publicBoard = document.getElementById('public-board');
const playerSelect = document.getElementById('player-select');
const nameInput = document.getElementById('player-name');
const cardInitInput = document.getElementById('card-init');
const boosterInput = document.getElementById('booster');
const levelInput = document.getElementById('level');
const totalDisp = document.getElementById('total-val');
const readyBtn = document.getElementById('ready-btn');
const newGameBtn = document.getElementById('new-game-btn');

let currentSeat = null;
let globalState = null;

// Handle Local Initiative Calculation
const updateLocalTotal = () => {
    const total = parseInt(cardInitInput.value || 0) + parseInt(boosterInput.value || 0);
    totalDisp.innerText = total;
};
[cardInitInput, boosterInput].forEach(el => el.addEventListener('input', updateLocalTotal));

// Handle Seat Selection & Persistence
playerSelect.addEventListener('change', (e) => {
    currentSeat = e.target.value;
    localStorage.setItem('atlantis_seat', currentSeat);
    syncUIWithState();
});

const savedSeat = localStorage.getItem('atlantis_seat');
if (savedSeat) {
    playerSelect.value = savedSeat;
    currentSeat = savedSeat;
}

// Global Sync from Firebase
onValue(ref(db, 'game'), (snapshot) => {
    globalState = snapshot.val();
    if (!globalState) {
        initializeNewGame(); // Auto-init if DB is empty
        return;
    }
    renderPublicBoard();
    syncUIWithState();
});

// Updates the Private Side UI based on what's in the Database
function syncUIWithState() {
    if (!currentSeat || !globalState?.players?.[currentSeat]) return;
    const p = globalState.players[currentSeat];
    
    // Toggle Ready Button Style
    if (p.isReady) {
        readyBtn.innerText = "READIED UP!";
        readyBtn.classList.add('ready-active');
    } else {
        readyBtn.innerText = "READY UP";
        readyBtn.classList.remove('ready-active');
    }

    // Update Coin Visual
    coinDisplay.className = `coin ${globalState.coin}`;
    coinDisplay.innerText = `${globalState.coin.toUpperCase()} TIE-BREAKER`;
}

// Ready Up Action
readyBtn.addEventListener('click', () => {
    if (!currentSeat) {
        alert("Select your Player Number first!");
        return;
    }

    const isCurrentlyReady = globalState.players[currentSeat].isReady;
    const total = parseInt(cardInitInput.value || 0) + parseInt(boosterInput.value || 0);

    update(ref(db, `game/players/${currentSeat}`), {
        name: nameInput.value || `Guardian ${currentSeat.replace('p', '')}`,
        cardInit: parseInt(cardInitInput.value || 0),
        booster: parseInt(boosterInput.value || 0),
        level: parseInt(levelInput.value || 1),
        totalInit: total,
        isReady: !isCurrentlyReady
    });
});

// The Oracle: Rendering the Public Board
function renderPublicBoard() {
    const playersArr = Object.values(globalState.players);
    const allReady = playersArr.every(p => p.isReady);
    publicBoard.innerHTML = "";

    if (!allReady) {
        // LOBBY MODE: List 1-6 in order
        for (let i = 1; i <= 6; i++) {
            const p = globalState.players[`p${i}`];
            const div = document.createElement('div');
            div.className = `status-row ${p.team}`;
            div.innerHTML = `
                <span>${p.name} (Lvl ${p.level})</span>
                <span class="${p.isReady ? 'status-ready' : 'status-waiting'}">
                    ${p.isReady ? 'READY' : '...'}
                </span>
            `;
            publicBoard.appendChild(div);
        }
    } else {
        // REVEAL MODE: Calculated Order
        const ordered = calculateTurnOrder(playersArr, globalState.coin);
        ordered.forEach((slot, index) => {
            const div = document.createElement('div');
            div.className = `status-row ${slot.team}`;
            div.innerHTML = `
                <span><strong>${index + 1}.</strong> ${slot.name} (Lvl ${slot.level})</span>
                <span>Init: <strong>${slot.total}</strong></span>
            `;
            publicBoard.appendChild(div);
        });
    }
}

// Tie-Breaker Logic
function calculateTurnOrder(players, initialCoin) {
    let grouped = {};
    players.forEach(p => {
        if(!grouped[p.totalInit]) grouped[p.totalInit] = { red: [], blue: [] };
        grouped[p.totalInit][p.team].push(p);
    });
    
    let sortedTotals = Object.keys(grouped).map(Number).sort((a,b) => b-a);
    let finalOrder = [];
    let tempCoin = initialCoin;
    
    sortedTotals.forEach(total => {
        let reds = [...grouped[total].red];
        let blues = [...grouped[total].blue];
        
        while(reds.length > 0 || blues.length > 0) {
            if (reds.length > 0 && blues.length > 0) {
                // Opposing tie!
                if (tempCoin === 'red') {
                    finalOrder.push(formatEntry(reds, 'red', total));
                    reds = []; // Consume all teammates for this spot
                    tempCoin = 'blue';
                } else {
                    finalOrder.push(formatEntry(blues, 'blue', total));
                    blues = [];
                    tempCoin = 'red';
                }
            } else if (reds.length > 0) {
                finalOrder.push(formatEntry(reds, 'red', total));
                reds = [];
            } else {
                finalOrder.push(formatEntry(blues, 'blue', total));
                blues = [];
            }
        }
    });
    return finalOrder;
}

function formatEntry(playerSubGroup, team, total) {
    return {
        name: playerSubGroup.map(p => p.name).join(" OR "),
        level: playerSubGroup.map(p => p.level).join("/"),
        team: team,
        total: total
    };
}

// Reset Game Function
const initializeNewGame = () => {
    const players = {};
    for(let i=1; i<=6; i++) {
        players[`p${i}`] = {
            name: `Guardian ${i}`,
            team: i <= 3 ? 'red' : 'blue',
            cardInit: 0,
            booster: 0,
            level: 1,
            totalInit: 0,
            isReady: false
        };
    }
    set(ref(db, 'game'), {
        coin: Math.random() > 0.5 ? 'red' : 'blue',
        players: players
    });
};

newGameBtn.addEventListener('click', () => {
    if(confirm("Reset New Game? All initiatives and levels will be cleared.")) {
        initializeNewGame();
    }
});
