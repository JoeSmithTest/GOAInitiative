// Firebase references
const playersRef = db.ref("players");
const coinRef = db.ref("coin");

// DOM elements
const playerSlotInput = document.getElementById("playerSlot");
const playerNameInput = document.getElementById("playerName");
const playerLevelInput = document.getElementById("playerLevel");
const playerBoosterInput = document.getElementById("playerBooster");
const playerCardInput = document.getElementById("playerCard");
const readyButton = document.getElementById("readyButton");
const newGameButton = document.getElementById("newGameButton");
const privateMessage = document.getElementById("privateMessage");
const turnOrderList = document.getElementById("turnOrderList");
const coinDiv = document.getElementById("coin");
const coinLabel = document.getElementById("coinLabel");

let coinSide = "red";
let coinHistory = [];

// Initialize tie-breaker coin if missing
coinRef.once("value", snapshot => {
    if (!snapshot.exists()) {
        coinRef.set({ side: "red", history: ["red"] });
    }
});

// Update coin display
coinRef.on("value", snapshot => {
    const coinData = snapshot.val();
    coinSide = coinData.side;
    coinHistory = coinData.history || [];
    coinDiv.style.backgroundColor = coinSide;
    coinLabel.textContent = `Tie-breaker Coin: ${coinSide.toUpperCase()} | History: ${coinHistory.join(" → ")}`;
});

// Initialize 6 player slots if missing
function initializePlayers() {
    playersRef.once("value", snapshot => {
        const data = snapshot.val() || {};
        for (let i = 0; i < 6; i++) {
            if (!data[i]) {
                playersRef.child(i).set({
                    name: `Player${i+1}`,
                    team: (i < 3) ? "red" : "blue",
                    level: 1,
                    booster: 0,
                    card: 0,
                    ready: false,
                    slot: i
                });
            }
        }
    });
}
initializePlayers();

// Ready button logic (player can choose slot anytime)
readyButton.addEventListener("click", () => {
    const playerId = parseInt(playerSlotInput.value);
    const assignedTeam = (playerId < 3) ? "red" : "blue";

    playersRef.child(playerId).set({
        name: playerNameInput.value || `Player${playerId+1}`,
        team: assignedTeam,
        level: parseInt(playerLevelInput.value) || 1,
        booster: parseInt(playerBoosterInput.value) || 0,
        card: parseInt(playerCardInput.value) || 0,
        ready: true,
        slot: playerId
    });

    privateMessage.textContent = `You are Player ${playerId+1} on ${assignedTeam.toUpperCase()} team. Ready!`;
});

// New Game button logic
newGameButton.addEventListener("click", () => {
    playersRef.once("value", snapshot => {
        const data = snapshot.val() || {};
        for (let i = 0; i < 6; i++) {
            if (data[i]) {
                playersRef.child(i).update({
                    card: 0,
                    ready: false,
                    level: 1
                });
            }
        }
    });
    coinRef.set({ side: "red", history: ["red"] });
});

// Listen to all players and update public section
playersRef.on("value", snapshot => {
    const data = snapshot.val() || {};
    const playersArray = Object.values(data).sort((a,b) => a.slot - b.slot);

    turnOrderList.innerHTML = "";
    let allReady = true;

    // Show public list with level and ready status
    playersArray.forEach(p => {
        const li = document.createElement("li");
        li.textContent = `Player ${p.slot+1}: ${p.name} (Team ${p.team.toUpperCase()}, Level ${p.level}) - ${p.ready ? "Ready ✅" : "Waiting ⏳"}`;
        li.style.color = p.team;
        turnOrderList.appendChild(li);
        if (!p.ready) allReady = false;
    });

    // Calculate turn order if all ready
    if (allReady && playersArray.length > 0) {
        calculateTurnOrder(playersArray);
    }
});

// Calculate turn order with tie-breakers
function calculateTurnOrder(playersArray) {
    playersArray.forEach(p => p.total = (p.card || 0) + (p.booster || 0));
    playersArray.sort((a,b) => b.total - a.total);

    let finalOrder = [];
    let i = 0;
    while (i < playersArray.length) {
        let tieGroup = [playersArray[i]];
        let j = i+1;
        while (j < playersArray.length && playersArray[j].total === playersArray[i].total) {
            tieGroup.push(playersArray[j]);
            j++;
        }

        const teams = new Set(tieGroup.map(p => p.team));
        if (teams.size === 1) {
            tieGroup.forEach(p => finalOrder.push(p));
        } else {
            const redPlayers = tieGroup.filter(p => p.team === "red");
            const bluePlayers = tieGroup.filter(p => p.team === "blue");
            if (coinSide === "red") {
                redPlayers.forEach(p => finalOrder.push(p));
                bluePlayers.forEach(p => finalOrder.push(p));
                flipCoin();
            } else {
                bluePlayers.forEach(p => finalOrder.push(p));
                redPlayers.forEach(p => finalOrder.push(p));
                flipCoin();
            }
        }
        i = j;
    }

    // Update public section with turn numbers and levels
    turnOrderList.innerHTML = "";
    finalOrder.forEach((p,index) => {
        const li = document.createElement("li");
        li.textContent = `Turn ${index+1}: Player ${p.slot+1} - ${p.name} (Level ${p.level}) - Total: ${p.total}`;
        li.style.color = p.team;
        turnOrderList.appendChild(li);
    });

    // Reset card initiative and readiness for next turn
    playersArray.forEach(p => {
        playersRef.child(p.slot).update({ card: 0, ready: false });
    });
}

// Flip coin
function flipCoin() {
    coinSide = (coinSide === "red") ? "blue" : "red";
    coinHistory.push(coinSide);
    coinRef.set({ side: coinSide, history: coinHistory });
}
