import { db, auth } from './config.js';
import { doc, setDoc, getDocs, collection, writeBatch } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// Flagg-hjälpare
export const flags = { "Mexiko": "mx", "Sydafrika": "za", "Sydkorea": "kr", "Kanada": "ca", "USA": "us", "Paraguay": "py", "Qatar": "qa", "Schweiz": "ch", "Brasilien": "br", "Marocko": "ma", "Haiti": "ht", "Skottland": "gb-sct", "Australien": "au", "Tyskland": "de", "Curaçao": "cw", "Nederländerna": "nl", "Japan": "jp", "Elfenbenskusten": "ci", "Ecuador": "ec", "Tunisien": "tn", "Spanien": "es", "Kap Verde": "cv", "Belgien": "be", "Egypten": "eg", "Saudiarabien": "sa", "Uruguay": "uy", "Iran": "ir", "Nya Zeeland": "nz", "Frankrike": "fr", "Senegal": "sn", "Norge": "no", "Argentina": "ar", "Algeriet": "dz", "Österrike": "at", "Jordanien": "jo", "Portugal": "pt", "England": "gb-eng", "Kroatien": "hr", "Ghana": "gh", "Panama": "pa", "Uzbekistan": "uz", "Colombia": "co" };
export const f = (t) => flags[t] ? `<img src="https://flagcdn.com/20x15/${flags[t]}.png" style="vertical-align:middle; margin-right:6px;" width="20" height="15">` : '🌍 ';

const groupLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
let currentIndex = 0;
let currentTeams = [];
let selFirst = null;
let selSecond = null;
let allMatches = []; // Sätts från app.js

export function initWizard(matchesData) {
    allMatches = matchesData;
    loadGroup(currentIndex);

    document.getElementById('btn-spicy-random').addEventListener('click', spicyAutoFill);
    document.getElementById('btn-next-group') || document.getElementById('btn-save-group').addEventListener('click', saveAndNext);
    document.getElementById('btn-prev-group').addEventListener('click', () => { if(currentIndex > 0) loadGroup(--currentIndex); });
}

function loadGroup(index) {
    const letter = groupLetters[index];
    document.getElementById('wizard-title').textContent = `Grupp ${letter}`;
    selFirst = null; selSecond = null;

    const groupMatches = allMatches.filter(m => m.stage === `Grupp ${letter}`);
    currentTeams = Array.from(new Set(groupMatches.flatMap(m => [m.homeTeam, m.awayTeam])));
    
    renderTeamSelectors();
    
    const container = document.getElementById('wizard-matches');
    container.innerHTML = '';
    
    // Här hämtar vi från Databasen om användaren redan tippat
    const userId = auth.currentUser.uid;
    
    groupMatches.forEach(m => {
        container.innerHTML += `
            <div class="match-card">
                <div class="match-teams">
                    <span class="team-name home" id="wizNameHome-${m.id}">${f(m.homeTeam)}${m.homeTeam}</span>
                    <div>
                        <input type="number" min="0" id="wizHome-${m.id}" class="score-input" placeholder="-" oninput="window.updateWizTable()"> : 
                        <input type="number" min="0" id="wizAway-${m.id}" class="score-input" placeholder="-" oninput="window.updateWizTable()">
                    </div>
                    <span class="team-name away" id="wizNameAway-${m.id}">${f(m.awayTeam)}${m.awayTeam}</span>
                </div>
            </div>`;
    });
    
    window.updateWizTable = updateWizardTable; // Gör tillgänglig globalt
    updateWizardTable();
}

function renderTeamSelectors() {
    const container = document.getElementById('wizard-team-selectors');
    container.innerHTML = '';
    currentTeams.forEach(team => {
        let cls = team === selFirst ? 'rank-1' : (team === selSecond ? 'rank-2' : '');
        container.innerHTML += `<div class="team-chip ${cls}" onclick="window.toggleWizTeam('${team}')">${f(team)}${team}</div>`;
    });
}

window.toggleWizTeam = function(team) {
    if (selFirst === team) selFirst = null;
    else if (selSecond === team) selSecond = null;
    else if (!selFirst) selFirst = team;
    else if (!selSecond) selSecond = team;
    renderTeamSelectors();
}

// SPICY SLUMPGENERATORN (Simulerar slots först, mappar lagen sen)
function spicyAutoFill() {
    if (!selFirst || !selSecond) return alert("Välj ettan och tvåan först!");

    const unselected = currentTeams.filter(t => t !== selFirst && t !== selSecond);
    const targetStandings = [selFirst, selSecond, unselected[0], unselected[1]]; // Hur vi vill att tabellen ska sluta

    // 1. Skapa 4 "Anonyma Slots" och generera 6 slumpmatcher mellan dem
    let slots = [ {id: 0, pts:0, gd:0, gf:0}, {id: 1, pts:0, gd:0, gf:0}, {id: 2, pts:0, gd:0, gf:0}, {id: 3, pts:0, gd:0, gf:0} ];
    let simMatches = [ [0,1], [2,3], [0,2], [1,3], [0,3], [1,2] ]; // Alla möter alla
    let generatedScores = [];

    simMatches.forEach(match => {
        const homeScore = Math.floor(Math.random() * 4);
        const awayScore = Math.floor(Math.random() * 4);
        generatedScores.push({ hId: match[0], aId: match[1], h: homeScore, a: awayScore });
        
        // Uppdatera simulerad tabell
        let h = slots[match[0]]; let a = slots[match[1]];
        h.gf += homeScore; a.gf += awayScore; h.gd += (homeScore-awayScore); a.gd += (awayScore-homeScore);
        if(homeScore > awayScore) h.pts += 3; else if(awayScore > homeScore) a.pts += 3; else { h.pts++; a.pts++; }
    });

    // 2. Sortera de anonyma slotsen för att se vilken "Slot" som kom 1:a, 2:a etc.
    slots.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

    // 3. Mappa tillbaka! Slotten som vann = selFirst.
    let slotToTeamMap = {};
    slotToTeamMap[slots[0].id] = targetStandings[0]; // 1:an
    slotToTeamMap[slots[1].id] = targetStandings[1]; // 2:an
    slotToTeamMap[slots[2].id] = targetStandings[2]; // 3:an
    slotToTeamMap[slots[3].id] = targetStandings[3]; // 4:an

    // 4. Skriv ut resultaten i UI:t baserat på vilka lag som möts
    const letter = groupLetters[currentIndex];
    const groupMatches = allMatches.filter(m => m.stage === `Grupp ${letter}`);

    groupMatches.forEach(m => {
        // Hitta vilken av våra simulerade matcher som motsvarar denna RIKTIGA match
        const simM = generatedScores.find(sim => 
            (slotToTeamMap[sim.hId] === m.homeTeam && slotToTeamMap[sim.aId] === m.awayTeam) ||
            (slotToTeamMap[sim.aId] === m.homeTeam && slotToTeamMap[sim.hId] === m.awayTeam)
        );

        if(simM) {
            if(slotToTeamMap[simM.hId] === m.homeTeam) {
                document.getElementById(`wizHome-${m.id}`).value = simM.h;
                document.getElementById(`wizAway-${m.id}`).value = simM.a;
            } else {
                document.getElementById(`wizHome-${m.id}`).value = simM.a;
                document.getElementById(`wizAway-${m.id}`).value = simM.h;
            }
        }
    });

    updateWizardTable();
}

function updateWizardTable() {
    const letter = groupLetters[currentIndex];
    const groupMatches = allMatches.filter(m => m.stage === `Grupp ${letter}`);
    let tData = {};
    currentTeams.forEach(t => tData[t] = { name: t, pld: 0, pts: 0, gd: 0 });

    groupMatches.forEach(m => {
        const hInp = document.getElementById(`wizHome-${m.id}`).value;
        const aInp = document.getElementById(`wizAway-${m.id}`).value;
        
        if (hInp !== '' && aInp !== '') {
            const h = parseInt(hInp); 
            const a = parseInt(aInp); // RÄTTAD HÄR! Var aInput innan.
            
            let ht = tData[m.homeTeam]; 
            let at = tData[m.awayTeam];
            
            ht.pld++; at.pld++; 
            ht.gd += (h-a); at.gd += (a-h);
            
            if (h > a) ht.pts += 3; 
            else if (h < a) at.pts += 3; 
            else { ht.pts++; at.pts++; }
        }
    });

    let sorted = Object.values(tData).sort((a, b) => b.pts - a.pts || b.gd - a.gd);
    let html = `<table class="group-table" style="background:transparent;"><thead><tr><th>Lag</th><th>S</th><th>+/-</th><th>P</th></tr></thead><tbody>`;
    sorted.forEach((t, i) => {
        let bg = i===0 ? 'background:rgba(40,167,69,0.1);' : (i===1 ? 'background:rgba(23,162,184,0.05);' : '');
        html += `<tr style="${bg}"><td>${f(t.name)}${t.name}</td><td>${t.pld}</td><td>${t.gd > 0 ? '+'+t.gd : t.gd}</td><td><strong>${t.pts}</strong></td></tr>`;
    });
    document.getElementById('wizard-live-table').innerHTML = html + `</tbody></table>`;
}

// SPARA TILL FIREBASE
async function saveAndNext() {
    const letter = groupLetters[currentIndex];
    const groupMatches = allMatches.filter(m => m.stage === `Grupp ${letter}`);
    
    const batch = writeBatch(db);
    const userId = auth.currentUser.uid;

    groupMatches.forEach(m => {
        const h = document.getElementById(`wizHome-${m.id}`).value;
        const a = document.getElementById(`wizAway-${m.id}`).value;
        if(h !== '' && a !== '') {
            const tipRef = doc(db, "users", userId, "tips", m.id.toString());
            batch.set(tipRef, { homeScore: parseInt(h), awayScore: parseInt(a), homeTeam: m.homeTeam, awayTeam: m.awayTeam, stage: m.stage });
        }
    });

    try {
        await batch.commit();
        if (currentIndex < 11) { loadGroup(++currentIndex); window.scrollTo(0,0); } 
        else { alert("Gruppspel färdigtippat!"); document.querySelector('[data-target="bracket-tab"]').click(); }
    } catch (e) { console.error("Fel vid sparning", e); }
}
