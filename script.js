import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// TODO: Replace this with your actual Firebase config later
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
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
let amIReady = false;

// 1. Calculate Local Total
[cardInitInput, boosterInput].forEach(el => {
    el.addEventListener('input', () => {
        totalDisp.innerText = parseInt(cardInitInput.value || 0) + parseInt(boosterInput.value || 0);
    });
});

// 2. Handle Seat Selection (Saves to local storage so it remembers on refresh)
playerSelect.addEventListener('change', (e) => {
    currentSeat = e.target.value;
    localStorage.setItem('guardianSeat', currentSeat);
    checkMyReadyState();
});

// Restore seat on load
const savedSeat = localStorage.getItem('guardianSeat');
if (savedSeat) {
    playerSelect.value = savedSeat;
    currentSeat = savedSeat;
}

// 3. Sync from Firebase
onValue(ref(db, 'game'), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    globalState = data;
    
    // Update Coin
    coinDisplay.className = `coin ${data.coin}`;
    coinDisplay.innerText = `${data.coin.toUpperCase()} TIE-BREAKER`;

    checkMyReadyState();
    renderPublicBoard();
});

function checkMyReadyState() {
    if (!currentSeat || !globalState?.players?.[currentSeat]) return;
    amIReady = globalState.players[currentSeat].isReady;
    
    if (amIReady) {
        readyBtn.innerText = "READIED UP!";
        readyBtn.classList.add('ready-active');
    } else {
        readyBtn.innerText = "READY UP";
        readyBtn.classList.remove('ready-active');
    }
}

// 4. Ready Up Action
readyBtn.addEventListener('click', () => {
    if (!currentSeat) {
        alert("Please select your Guardian Seat first!");
        return;
    }

    const team = ['p1', 'p2', 'p3'].includes(currentSeat) ? 'red' : 'blue';
    const total = parseInt(cardInitInput.value || 0) + parseInt(boosterInput.value || 0);

    // Toggle ready state
    amIReady = !amIReady;

    update(ref(db, `game/players/${currentSeat}`), {
        name: nameInput.value || `Guardian ${currentSeat.replace('p', '')}`,
        team: team,
        cardInit: parseInt(cardInitInput.value || 0),
        booster: parseInt(boosterInput.value || 0),
        level: parseInt(levelInput.value || 1),
        totalInit: total,
        isReady: amIReady
    });
});

// 5. Render the Public Board
function renderPublicBoard() {
    if (!globalState || !globalState.players) return;

    const players = Object.values(globalState.players);
    const allReady = players.length === 6 && players.every(p => p.isReady);

    publicBoard.innerHTML = "";

    if (!allReady) {
        // Show Waiting List
        players.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = `status-row ${p.team}`;
            div.innerHTML = `
                <span>${p.name || `Player ${i+1}`} (Lvl ${p.level})</span>
                <span class="${p.isReady ? 'status-ready' : 'status-waiting'}">
                    ${p.isReady ? 'Readied' : 'Thinking...'}
                </span>
            `;
            publicBoard.appendChild(div);
        });
    } else {
        // EVERYONE IS READY: Calculate and show order
        const orderedTurn = calculateTurnOrder(players, globalState.coin);
        
        orderedTurn.forEach((slot, index) => {
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

// 6. The Interleaving Tie-Breaker Algorithm
function calculateTurnOrder(players, currentCoin) {
    let grouped = {};
    players.forEach(p => {
        if(!grouped[p.totalInit]) grouped[p.totalInit] = { red: [], blue: [] };
        grouped[p.totalInit][p.team].push(p);
    });
    
    let sortedTotals = Object.keys(grouped).map(Number).sort((a,b) => b-a);
    let finalOrder = [];
    let tempCoin = currentCoin;
    
    sortedTotals.forEach(total => {
        let reds = grouped[total].red;
        let blues = grouped[total].blue;
        
        // Format names for same-team ties (e.g., "Player 1 OR Player 2")
        let redNameFormat = reds.map(p => p.name).join(" OR ");
        let redLevelFormat = reds.map(p => p.level).join("/");
        let blueNameFormat = blues.map(p => p.name).join(" OR ");
        let blueLevelFormat = blues.map(p => p.level).join("/");

        let remainingReds = reds.length;
        let remainingBlues = blues.length;

        while(remainingReds > 0 || remainingBlues > 0) {
            if (remainingReds > 0 && remainingBlues > 0) {
                // Opposing teams tied! Team with coin goes, then coin flips.
                if (tempCoin === 'red') {
                    finalOrder.push({ name: redNameFormat, team: 'red', total: total, level: redLevelFormat });
                    remainingReds--;
                    tempCoin = 'blue';
                } else {
                    finalOrder.push({ name: blueNameFormat, team: 'blue', total: total, level: blueLevelFormat });
                    remainingBlues--;
                    tempCoin = 'red';
                }
            } else if (remainingReds > 0) {
                finalOrder.push({ name: redNameFormat, team: 'red', total: total, level: redLevelFormat });
                remainingReds--;
            } else if (remainingBlues > 0) {
                finalOrder.push({ name: blueNameFormat, team: 'blue', total: total, level: blueLevelFormat });
                remainingBlues--;
            }
        }
    });
    
    return finalOrder;
}

// 7. New Game Reset
newGameBtn.addEventListener('click', () => {
    if(!confirm("Reset the entire game for everyone?")) return;
    
    const initialPlayers = {};
    for(let i=1; i<=6; i++) {
        initialPlayers[`p${i}`] = {
            name: `Player ${i}`,
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
        players: initialPlayers
    });

    // Reset local inputs
    cardInitInput.value = 0;
    boosterInput.value = 0;
    levelInput.value = 1;
    totalDisp.innerText = 0;
});
