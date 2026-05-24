// main.js

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, loginUser, logoutUser, syncStateToCloud, fetchStateFromCloud, fetchFoodByBarcode, processLabelWithGemini } from './api.js';
import { appState, setAppState, loadLocalState, saveLocalState, getActiveDayData, saveActiveDayData, calculateMacros, getFormattedDateString } from './logic.js';

// We will create these in the next step!
import { switchView, renderHome, renderDatabase, renderWeight, renderHistory, renderGoalsForm, populateNewFoodForm, applyEngineLockVisuals, startLiveScanner, stopScanner } from './ui.js';

// ==========================================
// 1. APP INITIALIZATION & AUTHENTICATION
// ==========================================
const authOverlay = document.getElementById('auth-overlay');
const mainApp = document.getElementById('main-app');

document.getElementById('btn-login').addEventListener('click', async () => {
    try { await loginUser(); } 
    catch (error) { alert("Login failed: " + error.message); }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await logoutUser();
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        authOverlay.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => authOverlay.classList.add('hidden'), 300);
        mainApp.classList.remove('hidden');
        document.getElementById('display-user-email').textContent = user.email;
        
        // Fetch User Data
        const cloudState = await fetchStateFromCloud(user.uid);
        if (cloudState) {
            setAppState(cloudState);
        } else {
            loadLocalState(); 
        }
        
        // Setup Date Trackers
        const todayStr = getFormattedDateString();
        document.getElementById('home-date-picker').value = todayStr;
        document.getElementById('weight-date').value = todayStr;
        const now = new Date();
        document.getElementById('weight-time').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        document.getElementById('history-date-picker').value = todayStr;

        // Archive Previous Day if Needed
        if (!appState.lastActiveDate) {
            appState.lastActiveDate = todayStr; 
            saveLocalState();
            syncStateToCloud(auth.currentUser.uid, appState);
        } else if (appState.lastActiveDate !== todayStr) {
            const alreadyArchived = appState.history.find(h => h.date === appState.lastActiveDate);
            if (!alreadyArchived) {
                appState.history.push({ date: appState.lastActiveDate, totals: { ...appState.totals }, diary: [...appState.diary] });
            }
            appState.totals = { cal: 0, p: 0, c: 0, f: 0 }; 
            appState.diary = []; 
            appState.lastActiveDate = todayStr; 
            
            saveLocalState();
            syncStateToCloud(auth.currentUser.uid, appState);
        }

        renderHome();
    } else {
        authOverlay.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        mainApp.classList.add('hidden');
    }
});

// ==========================================
// 2. GLOBAL WINDOW FUNCTIONS 
// (Required because your HTML uses inline onclick="")
// ==========================================
window.switchView = switchView;
window.startLiveScanner = startLiveScanner;
window.stopScanner = stopScanner;

window.deleteDiaryEntry = function(id) {
    const activeDataInfo = getActiveDayData(document.getElementById('home-date-picker').value);
    const index = activeDataInfo.diary.findIndex(e => e.id === id);
    
    if (index > -1) {
        const entry = activeDataInfo.diary[index];
        activeDataInfo.totals.cal = Math.max(0, activeDataInfo.totals.cal - entry.cal); 
        activeDataInfo.totals.p = Math.max(0, Math.round((activeDataInfo.totals.p - entry.p) * 10) / 10);
        activeDataInfo.totals.c = Math.max(0, Math.round((activeDataInfo.totals.c - entry.c) * 10) / 10); 
        activeDataInfo.totals.f = Math.max(0, Math.round((activeDataInfo.totals.f - entry.f) * 10) / 10);
        
        activeDataInfo.diary.splice(index, 1); 
        
        saveActiveDayData(activeDataInfo.totals, activeDataInfo.diary, activeDataInfo);
        if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);
        renderHome();
    }
};

window.deleteDBFood = function(id) { 
    if(confirm("Delete this food from your database?")) { 
        appState.foodDatabase = appState.foodDatabase.filter(f => f.id !== id); 
        saveLocalState(); 
        if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);
        renderDatabase(); 
    } 
};

window.deleteWeightEntry = function(id) { 
    if(confirm("Remove this log?")) { 
        appState.weightLog = appState.weightLog.filter(log => log.id !== id); 
        saveLocalState(); 
        if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);
        renderWeight(); 
    } 
};

// ==========================================
// 3. EVENT LISTENERS
// ==========================================

// --- Home / Logging ---
document.getElementById('home-date-picker').addEventListener('change', (e) => {
    const dateStr = e.target.value;
    const mainHeader = document.getElementById('home-display-date-main');
    const subHeader = document.getElementById('display-date');
    
    if (dateStr === getFormattedDateString()) {
        mainHeader.textContent = "Today";
    } else {
        const parts = dateStr.split('-');
        mainHeader.textContent = `${parts[1]}/${parts[2]}`;
    }
    const dateObj = new Date(dateStr + "T12:00:00");
    subHeader.textContent = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    
    renderHome();
});

document.getElementById('btn-home-log').addEventListener('click', () => {
    const searchEl = document.getElementById('home-db-search'); 
    const gramsEl = document.getElementById('home-db-grams'); 
    const timeEl = document.getElementById('home-log-time');
    
    const foodName = searchEl.value.trim(); 
    const grams = parseFloat(gramsEl.value); 
    const timeVal = timeEl.value;
    
    if (!foodName || isNaN(grams) || grams <= 0 || !timeVal) { 
        gramsEl.classList.add('border-red-400'); 
        setTimeout(() => gramsEl.classList.remove('border-red-400'), 600); 
        return; 
    }

    const food = appState.foodDatabase.find(f => f.name.toLowerCase() === foodName.toLowerCase()); 
    if (!food) return alert("Food not found in database. Search exactly or add it first.");

    const multi = grams / food.serving;
    const newEntry = { 
        id: Date.now(), time: timeVal, label: `${food.name} (${grams} ${food.unit || 'g'})`, 
        cal: Math.round(food.cal * multi), p: Math.round((food.p * multi) * 10) / 10, 
        c: Math.round((food.c * multi) * 10) / 10, f: Math.round((food.f * multi) * 10) / 10 
    };
    
    const activeDataInfo = getActiveDayData(document.getElementById('home-date-picker').value);
    activeDataInfo.diary.push(newEntry);
    activeDataInfo.totals.cal += newEntry.cal; 
    activeDataInfo.totals.p += newEntry.p; 
    activeDataInfo.totals.c += newEntry.c; 
    activeDataInfo.totals.f += newEntry.f;
    activeDataInfo.diary.sort((a, b) => a.time.localeCompare(b.time));
    
    saveActiveDayData(activeDataInfo.totals, activeDataInfo.diary, activeDataInfo);
    if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);

    gramsEl.value = ''; searchEl.value = ''; 
    document.getElementById('home-unit-label').textContent = 'g';
    renderHome();
});

// --- Quick Add ---
document.getElementById('btn-submit-quick-add').addEventListener('click', () => {
    const name = document.getElementById('quick-add-name').value || "Quick Add Meal";
    const cal = parseFloat(document.getElementById('quick-add-cal').value) || 0;
    const p = parseFloat(document.getElementById('quick-add-p').value) || 0;
    const c = parseFloat(document.getElementById('quick-add-c').value) || 0;
    const f = parseFloat(document.getElementById('quick-add-f').value) || 0;
    if(cal === 0 && p === 0 && c === 0 && f === 0) return alert("Please enter macros or calories.");

    const timeVal = document.getElementById('home-log-time').value || `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
    const newEntry = { id: Date.now(), time: timeVal, label: name, cal: Math.round(cal), p: Math.round(p*10)/10, c: Math.round(c*10)/10, f: Math.round(f*10)/10 };
    
    const activeDataInfo = getActiveDayData(document.getElementById('home-date-picker').value);
    activeDataInfo.diary.push(newEntry);
    activeDataInfo.totals.cal += newEntry.cal; 
    activeDataInfo.totals.p += newEntry.p; 
    activeDataInfo.totals.c += newEntry.c; 
    activeDataInfo.totals.f += newEntry.f;
    activeDataInfo.diary.sort((a, b) => a.time.localeCompare(b.time));
    
    saveActiveDayData(activeDataInfo.totals, activeDataInfo.diary, activeDataInfo);
    if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);
    
    document.getElementById('quick-add-modal').classList.add('hidden');
    document.getElementById('quick-add-name').value = ''; 
    document.getElementById('quick-add-cal').value = ''; document.getElementById('quick-add-p').value = ''; 
    document.getElementById('quick-add-c').value = ''; document.getElementById('quick-add-f').value = '';
    renderHome();
});

// --- Dynamic Unit Label ---
document.getElementById('home-db-search').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const food = appState.foodDatabase.find(f => f.name.toLowerCase() === val);
    document.getElementById('home-unit-label').textContent = food ? (food.unit || "g") : "g";
});

// --- Foods Database ---
document.getElementById('btn-save-db').addEventListener('click', () => {
    const nameEl = document.getElementById('new-db-name'); 
    const servingEl = document.getElementById('new-db-serving'); 
    const unitEl = document.getElementById('new-db-unit'); 
    const categoryEl = document.getElementById('new-db-category');
    const calEl = document.getElementById('new-db-cal'); 
    const pEl = document.getElementById('new-db-p'); 
    const cEl = document.getElementById('new-db-c'); 
    const fEl = document.getElementById('new-db-f');
    
    const name = nameEl.value.trim(); const serving = parseFloat(servingEl.value); const cal = parseFloat(calEl.value);
    if (!name || isNaN(cal) || isNaN(serving) || serving <= 0) { alert("Name, Serving Size, and Calories are required."); return; }

    appState.foodDatabase.push({ 
        id: Date.now(), name: name, serving: serving, unit: unitEl.value, category: categoryEl.value, 
        cal: cal, p: parseFloat(pEl.value) || 0, c: parseFloat(cEl.value) || 0, f: parseFloat(fEl.value) || 0 
    });
    
    saveLocalState();
    if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);
    
    nameEl.value=''; servingEl.value=''; calEl.value=''; pEl.value=''; cEl.value=''; fEl.value=''; 
    renderDatabase();
});

// --- Weight Log ---
document.getElementById('btn-log-weight').addEventListener('click', () => {
    const dateInput = document.getElementById('weight-date').value; 
    const timeInput = document.getElementById('weight-time').value; 
    const weightInput = document.getElementById('input-weight').value; 
    const w = parseFloat(weightInput);
    if (!dateInput || isNaN(w) || w <= 0) return;
    
    appState.weightLog.push({ id: Date.now(), date: dateInput, time: timeInput, weight: w }); 
    saveLocalState(); 
    if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);
    
    document.getElementById('input-weight').value = ''; 
    renderWeight();
});

document.getElementById('weight-view-type').addEventListener('change', renderWeight); 

// --- History Log ---
document.getElementById('history-view-type').addEventListener('change', renderHistory);

document.getElementById('history-date-picker').addEventListener('change', (e) => {
    const dateStr = e.target.value; 
    const resultDiv = document.getElementById('history-lookup-result');
    if (!dateStr) { resultDiv.classList.add('hidden'); return; } 
    resultDiv.classList.remove('hidden');

    let targetData = null;
    if (dateStr === getFormattedDateString()) { 
        targetData = { totals: appState.totals, diary: appState.diary }; 
    } else { 
        targetData = appState.history.find(h => h.date === dateStr); 
    }

    if (!targetData) { 
        resultDiv.innerHTML = `<div class="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center text-sm text-slate-500 font-bold border border-slate-200 dark:border-slate-700">No data found for this date.</div>`; 
        return; 
    }

    let diaryHTML = '';
    if (targetData.diary && targetData.diary.length > 0) {
        diaryHTML = targetData.diary.map(entry => `<div class="flex justify-between items-center py-2 border-t border-slate-100 dark:border-slate-700 mt-2 pt-2"><div class="text-xs"><div class="font-bold text-slate-700 dark:text-slate-200">${entry.label}</div><div class="text-[9px] text-slate-400 uppercase">${entry.time}</div></div><div class="text-xs font-black">${entry.cal} kcal</div></div>`).join('');
    } else { 
        diaryHTML = `<div class="text-[10px] text-slate-400 italic mt-2 border-t border-slate-100 dark:border-slate-700 pt-2">Detailed diary data unavailable.</div>`; 
    }

    resultDiv.innerHTML = `<div class="p-4 bg-blue-50 dark:bg-slate-800 rounded-xl border border-blue-100 dark:border-slate-700"><div class="flex justify-between items-end mb-2"><div class="text-xs font-bold text-blue-500 uppercase tracking-widest">Totals Found</div><div class="text-lg font-black text-slate-900 dark:text-white">${targetData.totals.cal} <span class="text-[10px] uppercase text-slate-500">kcal</span></div></div><div class="flex justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-2"><span>Pro: ${Math.round(targetData.totals.p)}g</span><span>Carb: ${Math.round(targetData.totals.c)}g</span><span>Fat: ${Math.round(targetData.totals.f)}g</span></div>${diaryHTML}</div>`;
});

// --- Goals & Macros ---
function handleMacroChange(trigger) {
    const currentCal = parseInt(document.getElementById('goal-engine-cal').value) || 0;
    const currentP = parseInt(document.getElementById('goal-engine-p').value) || 0;
    const currentC = parseInt(document.getElementById('goal-engine-c').value) || 0;
    const currentF = parseInt(document.getElementById('goal-engine-f').value) || 0;
    
    const results = calculateMacros(trigger, currentCal, currentP, currentC, currentF, appState.settings.isCalLocked);
    
    document.getElementById('goal-engine-cal').value = results.cal;
    document.getElementById('goal-engine-p').value = results.p;
    document.getElementById('goal-engine-c').value = results.c;
    document.getElementById('goal-engine-f').value = results.f;
    
    document.getElementById('pct-p').textContent = results.pctP + '%'; 
    document.getElementById('pct-c').textContent = results.pctC + '%'; 
    document.getElementById('pct-f').textContent = results.pctF + '%';

    const circumference = 251.2;
    document.getElementById('goal-chart-f').style.strokeDasharray = `${((results.f*9)/results.realTotal)*circumference} ${circumference}`; 
    document.getElementById('goal-chart-f').style.strokeDashoffset = 0;
    document.getElementById('goal-chart-c').style.strokeDasharray = `${((results.c*4)/results.realTotal)*circumference} ${circumference}`; 
    document.getElementById('goal-chart-c').style.strokeDashoffset = -(((results.f*9)/results.realTotal)*circumference);
    document.getElementById('goal-chart-p').style.strokeDasharray = `${((results.p*4)/results.realTotal)*circumference} ${circumference}`; 
    document.getElementById('goal-chart-p').style.strokeDashoffset = -((((results.f*9)+(results.c*4))/results.realTotal)*circumference);
}

// Ensure handleMacroChange is available globally for the UI initialization
window.handleMacroChange = handleMacroChange;

document.getElementById('btn-lock-cal').addEventListener('click', () => { 
    appState.settings.isCalLocked = !appState.settings.isCalLocked; 
    applyEngineLockVisuals(); 
    handleMacroChange('lock'); 
});

document.getElementById('goal-engine-cal').addEventListener('input', () => handleMacroChange('cal')); 
document.getElementById('goal-engine-p').addEventListener('input', () => handleMacroChange('p'));
document.getElementById('goal-engine-c').addEventListener('input', () => handleMacroChange('c')); 
document.getElementById('goal-engine-f').addEventListener('input', () => handleMacroChange('f'));

document.getElementById('btn-calc-tdee').addEventListener('click', () => {
    const tdee = parseInt(document.getElementById('goal-tdee').value) || 0; 
    const rate = parseFloat(document.getElementById('goal-rate').value) || 0;
    if (tdee > 0) { 
        const targetCal = tdee + (rate * 500); 
        document.getElementById('goal-engine-cal').value = Math.round(targetCal); 
        handleMacroChange('tdee'); 
    }
});

document.getElementById('btn-save-engine').addEventListener('click', () => {
    appState.targets.cal = parseInt(document.getElementById('goal-engine-cal').value, 10) || 2000; 
    appState.targets.p = parseInt(document.getElementById('goal-engine-p').value, 10) || 0;
    appState.targets.c = parseInt(document.getElementById('goal-engine-c').value, 10) || 0; 
    appState.targets.f = parseInt(document.getElementById('goal-engine-f').value, 10) || 0;
    
    appState.settings.goalWeight = document.getElementById('goal-weight').value; 
    appState.settings.rate = document.getElementById('goal-rate').value; 
    appState.settings.tdee = document.getElementById('goal-tdee').value;
    
    saveLocalState();
    if (auth.currentUser) syncStateToCloud(auth.currentUser.uid, appState);
    
    const btn = document.getElementById('btn-save-engine'); 
    btn.textContent = "Goals Applied!"; 
    btn.classList.replace('bg-slate-900', 'bg-emerald-500');
    setTimeout(() => { 
        btn.textContent = "Update Master Goals"; 
        btn.classList.replace('bg-emerald-500', 'bg-slate-900'); 
        renderHome(); 
    }, 1500);
});

// --- OCR Scanner Trigger ---
window.processLabelOCR = async function(input) {
    const apiKey = document.getElementById('api-key-input').value || localStorage.getItem('gemini_api_key');
    if (!apiKey) return alert("Please enter your Gemini API Key first.");
    
    localStorage.setItem('gemini_api_key', apiKey);
    document.getElementById('api-key-input').value = apiKey;

    const file = input.files[0];
    if (!file) return;
    document.getElementById('scanner-status').classList.remove('hidden');
    document.getElementById('scanner-status').textContent = "AI Reading Label...";

    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Data = reader.result.split(',')[1];
            const nutrition = await processLabelWithGemini(base64Data, file.type, apiKey);
            
            populateNewFoodForm(nutrition.name, nutrition.serving_g, "g", nutrition.cal, nutrition.pro, nutrition.carb, nutrition.fat);
            alert("Label successfully read!");
            
            document.getElementById('scanner-status').classList.add('hidden');
            document.getElementById('smart-scanner-modal').classList.add('hidden');
            input.value = ''; 
        };
    } catch (err) { 
        alert("AI failed to read the label. " + err.message); 
        document.getElementById('scanner-status').classList.add('hidden');
        document.getElementById('smart-scanner-modal').classList.add('hidden');
        input.value = ''; 
    }
}