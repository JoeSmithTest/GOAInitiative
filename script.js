// Firebase setup
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const playersRef = db.ref("players");
const coinRef = db.ref("coin");

// Global variables
let playerSlot = 0;
let coinSide = "red";
let coinHistory = [];
const turnOrderList = document.getElementById("turnOrderList");
const coinLabel = document.getElementById("coinLabel");

// Initialize players in Firebase if not exists
playersRef.once("value", snapshot => {
    if(!snapshot.exists()) {
        const initialPlayers = {};
        for(let i=0;i<6;i++){
            initialPlayers[i] = { name: `Player${i+1}`, team: i<3?"red":"blue", level:1, booster:0, card:0, ready:false, slot:i };
        }
        playersRef.set(initialPlayers);
    }
    updatePlayerDropdown();
});

// Update dropdown
function updatePlayerDropdown() {
    const dropdown = document.getElementById("playerSlot");
    dropdown.innerHTML = "";
    playersRef.once("value", snapshot=>{
        const data = snapshot.val() || {};
        for(let i=0;i<6;i++){
            const p = data[i];
            const option = document.createElement("option");
            option.value = i;
            option.textContent = `Player ${i+1} – [${p.team.toUpperCase()}] – ${p.name}`;
            dropdown.appendChild(option);
        }
    });
}

// Player slot selection
document.getElementById("playerSlot").addEventListener("change", e=>{
    playerSlot = parseInt(e.target.value);
    playersRef.child(playerSlot).once("value").then(snapshot=>{
        const p = snapshot.val();
        document.getElementById("playerName").value = p.name;
        document.getElementById("playerLevel").value = p.level;
        document.getElementById("initiativeBooster").value = p.booster;
        document.getElementById("cardInitiative").value = p.card;
    });
});

// Ready button
document.getElementById("readyButton").addEventListener("click", ()=>{
    const name = document.getElementById("playerName").value || `Player${playerSlot+1}`;
    const level = parseInt(document.getElementById("playerLevel").value) || 1;
    const booster = parseInt(document.getElementById("initiativeBooster").value) || 0;
    const card = parseInt(document.getElementById("cardInitiative").value) || 0;

    playersRef.child(playerSlot).update({ name, level, booster, card, ready:true });

    // Update public ready status
    updatePublicStatus();
});

// New Game
document.getElementById("newGameButton").addEventListener("click", ()=>{
    coinSide = Math.random()<0.5?"red":"blue";
    coinHistory = [coinSide];
    coinRef.set({ side: coinSide, history: coinHistory });

    playersRef.once("value").then(snapshot=>{
        const data = snapshot.val() || {};
        for(let i=0;i<6;i++){
            playersRef.child(i).update({ card:0, level:1, ready:false });
        }
    });
    updatePlayerDropdown();
    updatePublicStatus();
});

// Update public status (ready + turn order if all ready)
function updatePublicStatus(){
    playersRef.once("value").then(snapshot=>{
        const data = snapshot.val() || {};
        const allReady = Object.values(data).every(p=>p.ready);
        turnOrderList.innerHTML = "";

        // Show coin and ready status
        const coinDiv = document.getElementById("coinLabel");
        coinDiv.textContent = `Tie-breaker Coin: ${coinSide.toUpperCase()} | History: ${coinHistory.join(" → ")}`;

        // Show all players with ready/waiting if not all ready
        if(!allReady){
            Object.values(data).forEach(p=>{
                const li = document.createElement("li");
                li.textContent = `Player ${p.slot+1} - ${p.name} (Level ${p.level}) - ${p.ready?"Ready ✅":"Waiting ⏳"}`;
                li.style.color = p.team==="red"? "#ff4d4d":"#66ccff";
                li.setAttribute("data-team", p.team);
                turnOrderList.appendChild(li);
            });
        } else {
            // All ready → calculate turn order
            calculateTurnOrder(Object.values(data));
        }
    });
}

// Calculate turn order with tie-breaker coin
function calculateTurnOrder(playersArray){
    playersArray.forEach(p=>p.total=(p.card||0)+(p.booster||0));
    playersArray.sort((a,b)=>b.total - a.total);

    const finalOrder = [];
    let i = 0;
    while(i<playersArray.length){
        let tieGroup = [playersArray[i]];
        let j=i+1;
        while(j<playersArray.length && playersArray[j].total===playersArray[i].total){
            tieGroup.push(playersArray[j]);
            j++;
        }

        const teams = new Set(tieGroup.map(p=>p.team));
        if(teams.size===1){
            tieGroup.forEach(p=>finalOrder.push(p));
        } else {
            const redPlayers = tieGroup.filter(p=>p.team==="red");
            const bluePlayers = tieGroup.filter(p=>p.team==="blue");

            if(coinSide==="red"){
                redPlayers.forEach(p=>finalOrder.push(p));
                bluePlayers.forEach(p=>finalOrder.push(p));
            } else {
                bluePlayers.forEach(p=>finalOrder.push(p));
                redPlayers.forEach(p=>finalOrder.push(p));
            }
            flipCoin();
        }
        i=j;
    }

    // Display turn order
    turnOrderList.innerHTML="";
    finalOrder.forEach((p,index)=>{
        const li=document.createElement("li");
        const ordinals = ["1st","2nd","3rd","4th","5th","6th"];
        li.textContent = `${ordinals[index]}: Player ${p.slot+1} - ${p.name} (Level ${p.level}, Team ${p.team.toUpperCase()}) - Total: ${p.total}`;
        li.style.color = p.team==="red"? "#ff4d4d":"#66ccff";
        li.setAttribute("data-team", p.team);
        turnOrderList.appendChild(li);
    });

    // Reset card initiatives and ready for next turn
    playersArray.forEach(p=>{
        playersRef.child(p.slot).update({ card:0, ready:false });
    });

    updatePlayerDropdown();
}

// Flip coin function
function flipCoin(){
    coinSide = coinSide==="red"?"blue":"red";
    coinHistory.push(coinSide);
    coinRef.set({ side:coinSide, history:coinHistory });
}

// Listen for updates to keep multiple devices in sync
playersRef.on("value", updatePublicStatus);
coinRef.on("value", snapshot=>{
    const coinData = snapshot.val();
    if(coinData){
        coinSide=coinData.side;
        coinHistory=coinData.history||[coinSide];
        document.getElementById("coinLabel").textContent = `Tie-breaker Coin: ${coinSide.toUpperCase()} | History: ${coinHistory.join(" → ")}`;
    }
});
