// Firebase reference paths
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
const turnOrderList = document.getElementById("turnOrderList");
const coinDiv = document.getElementById("coin");
const coinLabel = document.getElementById("coinLabel");

let playerId = null;
let coinSide = "red";
let coinHistory = [];

// Assign a player slot when first connecting
playersRef.once("value", snapshot => {
    const data = snapshot.val() || {};
    // Find first empty slot (0-7)
    for (let i = 0; i < 8; i++) {
        if (!data[i]) {
            playerId = i;
            break;
        }
    }
    if (playerId === null) {
        privateMessage.textContent = "All player slots are full!";
        readyButton.disabled = true;
    }
});

// Initialize coin if not exists
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
    updateCoinDisplay();
});

function updateCoinDisplay() {
    coinDiv.style.backgroundColor = coinSide;
    coinLabel.textContent = `Tie-breaker Coin: ${coinSide.toUpperCase()} | History: ${coinHistory.join(" → ")}`;
}

// Handle ready button
readyButton.addEventListener("click", () => {
    if (!playerId) return;
    const playerData = {
        name: playerNameInput.value || `Player${playerId+1}`,
        team: playerTeamInput.value,
        level: parseInt(playerLevelInput.value) || 1,
        booster: parseInt(playerBoosterInput.value) || 0,
        card: parseInt(playerCardInput.value) || 0,
        ready: true
    };
    playersRef.child(playerId).set(playerData);
    privateMessage.textContent = "You are ready!";
});

// Listen to all players for real-time updates
playersRef.on("value", snapshot => {
    const data = snapshot.val() || {};
    const playersArray = Object.values(data);
    
    // Update readiness in public turn order
    let allReady = true;
    playersArray.forEach(p => { if (!p.ready) allReady = false; });

    // If all ready, calculate turn order
    if (allReady && playersArray.length > 0) {
        calculateTurnOrder(playersArray);
    } else {
        // Show readiness status
        turnOrderList.innerHTML = "";
        playersArray.forEach(p => {
            const li = document.createElement("li");
            li.textContent = `${p.name} (${p.team.toUpperCase()}) - ${p.ready ? "Ready ✅" : "Waiting ⏳"}`;
            li.style.color = p.team;
            turnOrderList.appendChild(li);
        });
    }
});

// Calculate turn order with tie-breakers
function calculateTurnOrder(playersArray) {
    // Compute total initiative
    playersArray.forEach(p => p.total = (p.card || 0) + (p.booster || 0));

    // Sort descending
    playersArray.sort((a, b) => b.total - a.total);

    // Handle tie-breakers
    let finalOrder = [];
    let i = 0;
    while (i < playersArray.length) {
        let tieGroup = [playersArray[i]];
        let j = i+1;
        while (j < playersArray.length && playersArray[j].total === playersArray[i].total) {
            tieGroup.push(playersArray[j]);
            j++;
        }

        // Check if tieGroup has mixed teams
        const teams = new Set(tieGroup.map(p => p.team));
        if (teams.size === 1) {
            // Same team, just list all in order with "or"
            tieGroup.forEach(p => finalOrder.push(p));
        } else {
            // Mixed teams, apply coin
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

    // Update public turn order list
    turnOrderList.innerHTML = "";
    finalOrder.forEach(p => {
        const li = document.createElement("li");
        li.textContent = `${p.name} (Level ${p.level}) - Total: ${p.total}`;
        li.style.color = p.team;
        turnOrderList.appendChild(li);
    });

    // Reset card initiative for next round but keep everything else
    playersArray.forEach(p => {
        playersRef.child(getPlayerIdByName(p.name)).update({ card: 0, ready: false });
    });
}

// Flip coin
function flipCoin() {
    coinSide = (coinSide === "red") ? "blue" : "red";
    coinHistory.push(coinSide);
    coinRef.set({ side: coinSide, history: coinHistory });
}

// Helper to find player ID by name
function getPlayerIdByName(name) {
    return Object.entries(db.ref("players")).find(([id, val]) => val.name === name)?.[0];
}