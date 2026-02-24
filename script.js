import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
const visualCoin = document.getElementById('visual-coin');
const publicBoard = document.getElementById('public-board');
const battleLog = document.getElementById('battle-log');
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
let lastCalculatedTurn = ""; // To prevent infinite reset loops

// Logic for Initiative Calculation
const updateLocalTotal = () => {
    const total = parseInt(cardInitInput.value || 0) + parseInt(boosterInput.value || 0);
    totalDisp.innerText = total;
};
[cardInitInput, boosterInput].forEach(el => el.addEventListener('input', updateLocalTotal));

playerSelect.addEventListener('change', (e) => {
    currentSeat = e.target.value;
    localStorage.setItem('atlantis_seat', currentSeat);
});

const savedSeat = localStorage.getItem('atlantis_seat');
if (savedSeat) { playerSelect.value = savedSeat; currentSeat = savedSeat; }

// Firebase Listener
onValue(ref(db, 'game'), (snapshot) => {
    globalState = snapshot.val();
    if (!globalState) return;

    updateCoinUI(globalState.coin);
    renderPublicBoard();
    updatePrivateUI();
});

function updateCoinUI(color) {
    visualCoin.className = `coin-graphic ${color}`;
}

function updatePrivateUI() {
    if (!currentSeat || !globalState.players[currentSeat]) return;
    const p = globalState.players[currentSeat];
    readyBtn.innerText = p.isReady ? "READIED UP!" : "READY UP";
    readyBtn.className = p.isReady ? "ready-active" : "";
}

readyBtn.addEventListener('click', () => {
    if (!currentSeat) return alert("Select Player Number!");
    const isReady = !globalState.players[currentSeat].isReady;
    const total = parseInt(cardInitInput.value || 0) + parseInt(boosterInput.value || 0);

    update(ref(db, `game/players/${currentSeat}`), {
        name: nameInput.value || `Guardian ${currentSeat.replace('p', '')}`,
        totalInit: total,
        level: parseInt(levelInput.value || 1),
        isReady: isReady
    });
});

function renderPublicBoard() {
    const playersArr = Object.values(globalState.players);
    const allReady = playersArr.every(p => p.isReady);
    publicBoard.innerHTML = "";
    
    if (!allReady) {
        battleLog.innerHTML = ""; // Clear log while waiting
        for (let i = 1; i <= 6; i++) {
            const p = globalState.players[`p${i}`];
            const div = document.createElement('div');
            div.className = `status-row ${p.team}`;
            div.innerHTML = `<span>${p.name} (Lvl ${p.level})</span>
                            <span class="${p.isReady ? 'status-ready' : 'status-waiting'}">
                            ${p.isReady ? 'READY' : '...'}</span>`;
            publicBoard.appendChild(div);
        }
    } else {
        const { order, log, finalCoin } = calculateTurnOrder(playersArr, globalState.coin);
        
        order.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = `status-row ${p.team}`;
            div.innerHTML = `<span><strong>${i+1}.</strong> ${p.displayName} (Lvl ${p.level})</span>
                            <span>Init: <strong>${p.total}</strong></span>`;
            publicBoard.appendChild(div);
        });

        battleLog.innerHTML = log.join("<br>");

        // AUTO-RESET: Only the person who "completed" the 6-player set triggers the DB update
        // We use a timeout to let people actually SEE the results before they vanish
        setTimeout(() => {
            if (allReady && currentSeat === playersArr.find(p => p.isReady).name) { // Logic to ensure only one client updates
                resetReadyStates(finalCoin);
            }
        }, 8000); // 8 seconds to view results
    }
}

function calculateTurnOrder(players, startCoin) {
    let log = [];
    let tempCoin = startCoin;
    let grouped = {};
    
    players.forEach(p => {
        if (!grouped[p.totalInit]) grouped[p.totalInit] = { red: [], blue: [] };
        grouped[p.totalInit][p.team].push(p);
    });

    let sortedTotals = Object.keys(grouped).map(Number).sort((a,b) => b-a);
    let finalOrder = [];

    sortedTotals.forEach(total => {
        let reds = grouped[total].red.sort(() => Math.random() - 0.5);
        let blues = grouped[total].blue.sort(() => Math.random() - 0.5);

        while (reds.length > 0 || blues.length > 0) {
            if (reds.length > 0 && blues.length > 0) {
                log.push(`Tie at ${total}! ${tempCoin.toUpperCase()} wins and coin flips.`);
                let winners = (tempCoin === 'red') ? reds : blues;
                let teamColor = tempCoin;
                
                winners.forEach(p => {
                    finalOrder.push({
                        displayName: winners.length > 1 ? `(TIE) ${p.name} (TIE)` : p.name,
                        team: teamColor, total: total, level: p.level
                    });
                });

                if (tempCoin === 'red') reds = []; else blues = [];
                tempCoin = (tempCoin === 'red') ? 'blue' : 'red';
            } else {
                let active = reds.length > 0 ? reds : blues;
                let teamColor = reds.length > 0 ? 'red' : 'blue';
                active.forEach(p => {
                    finalOrder.push({
                        displayName: active.length > 1 ? `(TIE) ${p.name} (TIE)` : p.name,
                        team: teamColor, total: total, level: p.level
                    });
                });
                reds = []; blues = [];
            }
        }
    });

    return { order: finalOrder, log: log, finalCoin: tempCoin };
}

async function resetReadyStates(newCoin) {
    const updates = {};
    updates['game/coin'] = newCoin;
    for (let i = 1; i <= 6; i++) {
        updates[`game/players/p${i}/isReady`] = false;
    }
    update(ref(db), updates);
}

newGameBtn.addEventListener('click', () => {
    if(!confirm("Start New Game?")) return;
    const players = {};
    for(let i=1; i<=6; i++) {
        players[`p${i}`] = { name: `Guardian ${i}`, team: i<=3?'red':'blue', cardInit: 0, booster: 0, level: 1, totalInit: 0, isReady: false };
    }
    set(ref(db, 'game'), { coin: Math.random() > 0.5 ? 'red' : 'blue', players: players });
});
