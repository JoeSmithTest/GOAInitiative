// Firebase setup
const firebaseConfig = {
  apiKey: "AIzaSyDJTX2FXoNbsJvoLoYmgDtXzYsKem4rYWE",
  authDomain: "goainitiative.firebaseapp.com",
  databaseURL: "https://goainitiative-default-rtdb.firebaseio.com",
  projectId: "goainitiative",
  storageBucket: "goainitiative.firebasestorage.app",
  messagingSenderId: "447333808415",
  appId: "1:447333808415:web:46c4acd8193a7b76b4982a"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const playersRef = db.ref("players");
const coinRef = db.ref("coin");

// Global variables
let playerSlot = null;
let coinSide = "red";
let coinHistory = [];
const turnOrderList = document.getElementById("turnOrderList");
const coinLabel = document.getElementById("coinLabel");
const dropdown = document.getElementById("playerSlot");

// Initialize players if not exist
playersRef.once("value").then(snapshot => {
    if (!snapshot.exists()) {
        const initialPlayers = {};
        for (let i = 0; i < 6; i++) {
            initialPlayers[i] = { name: `Player${i+1}`, team: i < 3 ? "red" : "blue", level: 1, booster: 0, card: 0, ready: false, slot: i };
        }
        playersRef.set(initialPlayers);
    }
}).finally(() => {
    // Enable dropdown after Firebase confirms players
    dropdown.disabled = false;
});

// Load saved info when player selects slot
dropdown.addEventListener("change", e => {
    if (e.target.value === "") return;
    playerSlot = parseInt(e.target.value);

    playersRef.child(playerSlot).once("value").then(snapshot => {
        const p = snapshot.val();
        if (!p) return;
        document.getElementById("playerName").value = p.name;
        document.getElementById("playerLevel").value = p.level;
        document.getElementById("initiativeBooster").value = p.booster;
        document.getElementById("cardInitiative").value = p.card;
    });
});

// Ready button
document.getElementById("readyButton").addEventListener("click", () => {
    if (playerSlot === null) return alert("Please select your player first!");
    const name = document.getElementById("playerName").value || `Player${playerSlot + 1}`;
    const level = parseInt(document.getElementById("playerLevel").value) || 1;
    const booster = parseInt(document.getElementById("initiativeBooster").value) || 0;
    const card = parseInt(document.getElementById("cardInitiative").value) || 0;

    playersRef.child(playerSlot).update({ name, level, booster, card, ready: true });
    updatePublicStatus();
});

// New Game
document.getElementById("newGameButton").addEventListener("click", () => {
    coinSide = Math.random() < 0.5 ? "red" : "blue";
    coinHistory = [coinSide];
    coinRef.set({ side: coinSide, history: coinHistory });

    playersRef.once("value").then(snapshot => {
        for (let i = 0; i < 6; i++) {
            playersRef.child(i).update({ card: 0, level: 1, ready: false });
        }
    });
    updatePublicStatus();
});

// Update public section
function updatePublicStatus() {
    playersRef.once("value").then(snapshot => {
        const data = snapshot.val() || {};
        const allReady = Object.values(data).every(p => p.ready);
        turnOrderList.innerHTML = "";

        // Show coin and history
        coinLabel.textContent = `Tie-breaker Coin: ${coinSide.toUpperCase()} | History: ${coinHistory.join(" → ")}`;

        if (!allReady) {
            Object.values(data).forEach(p => {
                const li = document.createElement("li");
                li.textContent = `Player ${p.slot + 1} - ${p.name} (Level ${p.level}) - ${p.ready ? "Ready ✅" : "Waiting ⏳"}`;
                li.style.color = p.team === "red" ? "#ff4d4d" : "#66ccff";
                li.setAttribute("data-team", p.team);
                turnOrderList.appendChild(li);
            });
        } else {
            calculateTurnOrder(Object.values(data));
        }
    });
}

// Calculate turn order with tie-breaker
function calculateTurnOrder(playersArray) {
    playersArray.forEach(p => p.total = (p.card || 0) + (p.booster || 0));
    playersArray.sort((a, b) => b.total - a.total);

    const finalOrder = [];
    let i = 0;
    while (i < playersArray.length) {
        let tieGroup = [playersArray[i]];
        let j = i + 1;
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
            } else {
                bluePlayers.forEach(p => finalOrder.push(p));
                redPlayers.forEach(p => finalOrder.push(p));
            }
            flipCoin();
        }
        i = j;
    }

    // Display top-to-bottom with ordinals
    turnOrderList.innerHTML = "";
    const ordinals = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
    finalOrder.forEach((p, index) => {
        const li = document.createElement("li");
        li.textContent = `${ordinals[index]}: Player ${p.slot + 1} - ${p.name} (Level ${p.level}, Team ${p.team.toUpperCase()}) - Total: ${p.total}`;
        li.style.color = p.team === "red" ? "#ff4d4d" : "#66ccff";
        li.setAttribute("data-team", p.team);
        turnOrderList.appendChild(li);
    });

    // Reset for next turn
    playersArray.forEach(p => {
        playersRef.child(p.slot).update({ card: 0, ready: false });
    });
}

// Flip coin
function flipCoin() {
    coinSide = coinSide === "red" ? "blue" : "red";
    coinHistory.push(coinSide);
    coinRef.set({ side: coinSide, history: coinHistory });
}

// Multi-device sync
playersRef.on("value", updatePublicStatus);
coinRef.on("value", snapshot => {
    const coinData = snapshot.val();
    if (coinData) {
        coinSide = coinData.side;
        coinHistory = coinData.history || [coinSide];
        coinLabel.textContent = `Tie-breaker Coin: ${coinSide.toUpperCase()} | History: ${coinHistory.join(" → ")}`;
    }
});
