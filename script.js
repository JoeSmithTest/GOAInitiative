// Firebase references
const playersRef = db.ref("players");
const coinRef = db.ref("coin");

// DOM elements
const playerNameInput = document.getElementById("playerName");
const playerTeamInput = document.getElementById("playerTeam");
const playerLevelInput = document.getElementById("playerLevel");
const playerBoosterInput = document.getElementById("playerBooster");
const playerCardInput = document.getElementById("playerCard");
const readyButton = document.getElementById("readyButton");
const privateMessage = document.getElementById("privateMessage");
const playerNumberEl = document.getElementById("playerNumber");
const turnOrderList = document.getElementById("turnOrderList");
const coinDiv = document.getElementById("coin");
const coinLabel = document.getElementById("coinLabel");

let playerId = null;
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

// Assign player slot and number
playersRef.once("value", snapshot => {
    const data = snapshot.val() || {};
    const teamCounts = { red: 0, blue: 0 };

    Object.values(data).forEach(p => {
        if (p.team === "red") teamCounts.red++;
        else if (p.team === "blue") teamCounts.blue++;
    });

    let teamSelected = playerTeamInput.value;
    if (teamCounts[teamSelected] >= 3) {
        privateMessage.textContent = `${teamSelected.toUpperCase()} team full! Choose the other team.`;
        readyButton.disabled = true;
        return;
    }

    for (let i = 0; i < 6; i++) {
        if (!data[i]) {
            playerId = i;
            break;
        }
    }

    if (playerId === null) {
        privateMessage.textContent = "All player slots are full!";
        readyButton.disabled = true;
        return;
    }

    playerNumberEl.textContent = `Your Player Number: ${playerId+1}`;
});

// Ready button logic
readyButton.addEventListener("click", () => {
    if (playerId === null) return;
    playersRef.child(playerId).set({
        name: playerNameInput.value || `Player${playerId+1}`,
        team: playerTeamInput.value,
        level: parseInt(playerLevelInput.value) || 1,
        booster: parseInt(playerBoosterInput.value) || 0,
        card: parseInt(playerCardInput.value) || 0,
        ready: true,
        slot: playerId
    });
    privateMessage.textContent = "You are ready!";
});

// Listen to all players and update public section
playersRef.on("value", snapshot => {
    const data = snapshot.val() || {};
    const playersArray = Object.values(data);
    playersArray.sort((a,b) => a.slot - b.slot);

    turnOrderList.innerHTML = "";
    let allReady = true;

    playersArray.forEach(p => {
        const li = document.createElement("li");
        li.textContent = `Player ${p.slot+1}: ${p.name} (${p.team.toUpperCase()}) - ${p.ready ? "Ready ✅" : "Waiting ⏳"}`;
        li.style.color = p.team;
        turnOrderList.appendChild(li);

        if (!p.ready) allReady = false;
    });

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

    // Update public section with turn numbers
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