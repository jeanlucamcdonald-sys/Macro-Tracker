// ui.js

import { appState, getActiveDayData, formatTime12, groupData, getFormattedDateString } from './logic.js';

// ==========================================
// VIEW NAVIGATION
// ==========================================

export function switchView(viewId) {
    document.querySelectorAll('.app-view').forEach(el => { 
        el.classList.add('hidden'); 
        el.classList.remove('block'); 
    });
    
    document.getElementById('view-' + viewId).classList.remove('hidden'); 
    document.getElementById('view-' + viewId).classList.add('block');
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.nav-btn[data-target="view-${viewId}"]`).classList.add('active');

    if(viewId === 'home') renderHome();
    if(viewId === 'database') renderDatabase();
    if(viewId === 'weight') renderWeight();
    if(viewId === 'history') renderHistory();
    if(viewId === 'goals') renderGoalsForm();
}

// ==========================================
// HOME & DIARY RENDERING
// ==========================================

export function updateDonutChart(dayTotals) {
    const p = dayTotals.p; const c = dayTotals.c; const f = dayTotals.f;
    const calGoal = appState.targets.cal || 1; 
    const circumference = 251.2; 
    
    const pCircle = document.getElementById('chart-p'); 
    const cCircle = document.getElementById('chart-c'); 
    const fCircle = document.getElementById('chart-f');
    
    const pCal = p * 4; const cCal = c * 4; const fCal = f * 9;
    const pLength = (pCal / calGoal) * circumference; 
    const cLength = (cCal / calGoal) * circumference; 
    const fLength = (fCal / calGoal) * circumference;

    fCircle.style.strokeDasharray = `${fLength} ${circumference}`; fCircle.style.strokeDashoffset = 0; 
    cCircle.style.strokeDasharray = `${cLength} ${circumference}`; cCircle.style.strokeDashoffset = -fLength;
    pCircle.style.strokeDasharray = `${pLength} ${circumference}`; pCircle.style.strokeDashoffset = -(fLength + cLength);

    function styleMiniDonut(macro, eaten, target, baseColor) {
        const pct = (eaten / target) * 100 || 0;
        const base = document.getElementById(`mini-${macro}`); 
        const excess = document.getElementById(`mini-${macro}-excess`); 
        const valTxt = document.getElementById(`val-${macro}`);
        
        if (pct <= 100) {
            base.style.strokeDasharray = `${pct} 100`; base.style.stroke = baseColor; excess.style.strokeDasharray = `0 100`;
            valTxt.classList.remove('text-red-500'); valTxt.classList.add('text-slate-800', 'dark:text-white');
        } else {
            base.style.strokeDasharray = `100 100`; base.style.stroke = baseColor; excess.style.strokeDasharray = `${Math.min(pct - 100, 100)} 100`; 
            excess.style.stroke = (macro === 'p') ? '#9333ea' : '#ef4444'; 
            valTxt.classList.remove('text-slate-800', 'dark:text-white'); valTxt.classList.add('text-red-500');
        }
    }
    
    styleMiniDonut('p', p, appState.targets.p, '#ef4444'); 
    styleMiniDonut('c', c, appState.targets.c, '#3b82f6'); 
    styleMiniDonut('f', f, appState.targets.f, '#eab308');
}

export function renderHome() {
    if(!document.getElementById('home-log-time').value) { 
        const now = new Date(); 
        document.getElementById('home-log-time').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; 
    }

    const selectedDate = document.getElementById('home-date-picker').value || getFormattedDateString();
    const activeData = getActiveDayData(selectedDate);

    document.getElementById('val-cal-remaining').textContent = appState.targets.cal - activeData.totals.cal;
    document.getElementById('val-cal-eaten').textContent = activeData.totals.cal; 
    document.getElementById('val-cal-goal').textContent = appState.targets.cal;
    
    document.getElementById('val-p').textContent = Math.round(activeData.totals.p); 
    document.getElementById('val-c').textContent = Math.round(activeData.totals.c); 
    document.getElementById('val-f').textContent = Math.round(activeData.totals.f);
    
    document.getElementById('target-p').textContent = appState.targets.p; 
    document.getElementById('target-c').textContent = appState.targets.c; 
    document.getElementById('target-f').textContent = appState.targets.f;

    setTimeout(() => updateDonutChart(activeData.totals), 50); 

    const listEl = document.getElementById('food-database-list'); 
    listEl.innerHTML = '';
    [...appState.foodDatabase].sort((a, b) => a.name.localeCompare(b.name)).forEach(food => { 
        const opt = document.createElement('option'); 
        opt.value = food.name; 
        listEl.appendChild(opt); 
    });

    const diaryContainer = document.getElementById('diary-container'); 
    diaryContainer.innerHTML = '';
    
    if (activeData.diary.length === 0) { 
        diaryContainer.innerHTML = `<div class="text-center py-4 text-xs text-slate-400 italic">No meals logged for this date.</div>`; 
        return; 
    }

    [...activeData.diary].reverse().forEach(entry => {
        const item = document.createElement('div'); 
        item.className = 'flex justify-between items-center py-3 border-b border-slate-50 dark:border-slate-800 last:border-0 last:pb-0';
        item.innerHTML = `
            <div class="flex-1 pr-3 overflow-hidden">
                <div class="flex items-center gap-2"><div class="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">${entry.label}</div><div class="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">${formatTime12(entry.time)}</div></div>
                <div class="text-[11px] font-bold text-slate-400 mt-1 flex gap-2"><span>P: <strong class="text-slate-600 dark:text-slate-300">${entry.p}g</strong></span> <span>C: <strong class="text-slate-600 dark:text-slate-300">${entry.c}g</strong></span> <span>F: <strong class="text-slate-600 dark:text-slate-300">${entry.f}g</strong></span></div>
            </div>
            <div class="flex items-center gap-2">
                <div class="font-black text-slate-900 dark:text-white">${entry.cal} <span class="text-[9px] text-slate-400 uppercase">kcal</span></div>
                <button onclick="deleteDiaryEntry(${entry.id})" class="text-slate-300 hover:text-red-500 p-1 ml-1"><svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg></button>
            </div>`;
        diaryContainer.appendChild(item);
    });
}

// ==========================================
// DATABASE RENDERING
// ==========================================

export function renderDatabase() {
    const container = document.getElementById('db-list-container'); 
    container.innerHTML = '';
    
    const grouped = {};
    [...appState.foodDatabase].forEach(f => {
        const cat = f.category || "Other";
        if(!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(f);
    });

    Object.keys(grouped).sort().forEach(categoryName => {
        const catGroup = document.createElement('div');
        catGroup.innerHTML = `<h2 class="text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[10px] font-bold mb-3 pl-1 border-b border-slate-200 dark:border-slate-800 pb-1">${categoryName}</h2><div class="space-y-2 mb-6" id="cat-group-${categoryName.replace(/[^a-zA-Z]/g, '')}"></div>`;
        container.appendChild(catGroup);
        
        const listEl = catGroup.querySelector('div');
        
        grouped[categoryName].sort((a,b)=>a.name.localeCompare(b.name)).forEach(food => {
            const el = document.createElement('div'); 
            el.className = 'bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center shadow-sm';
            el.innerHTML = `
                <div class="flex-1">
                    <div class="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">${food.name} <span class="text-[9px] text-slate-400 font-bold uppercase bg-slate-50 dark:bg-slate-800 px-1 py-0.5 rounded">(per ${food.serving} ${food.unit || 'g'})</span></div>
                    <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-1">${food.cal}kcal <span class="mx-1 text-slate-300">|</span> P:${food.p} C:${food.c} F:${food.f}</div>
                </div>
                <button onclick="deleteDBFood(${food.id})" class="text-slate-300 hover:text-red-500 p-2"><svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>`;
            listEl.appendChild(el);
        });
    });
}

export function populateNewFoodForm(name, serving, unit, cal, p, c, f) {
    switchView('database');
    document.getElementById('new-db-name').value = name;
    document.getElementById('new-db-serving').value = Math.round(serving);
    document.getElementById('new-db-unit').value = unit;
    document.getElementById('new-db-cal').value = Math.round(cal);
    document.getElementById('new-db-p').value = Math.round(p);
    document.getElementById('new-db-c').value = Math.round(c);
    document.getElementById('new-db-f').value = Math.round(f);
}

// ==========================================
// WEIGHT LOG RENDERING
// ==========================================

export function drawWeightChart() {
    const container = document.getElementById('weight-chart-container');
    if(appState.weightLog.length < 2) { 
        container.innerHTML = '<div class="h-full flex items-center justify-center text-xs text-slate-400 italic">Log at least 2 weights to see trend.</div>'; 
        return; 
    }
    
    const data = [...appState.weightLog].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-14);
    const maxW = Math.max(...data.map(d=>d.weight)); 
    const minW = Math.min(...data.map(d=>d.weight)); 
    const range = (maxW - minW) || 1; 
    const width = 300; const height = 100; const padding = 10;
    
    let points = data.map((d, i) => { 
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding); 
        const y = height - padding - ((d.weight - minW) / range) * (height - 2 * padding); 
        return `${x},${y}`; 
    }).join(' ');
    
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" class="w-full h-full overflow-visible"><polyline fill="none" stroke="#10b981" stroke-width="3" points="${points}" stroke-linecap="round" stroke-linejoin="round"/>${data.map((d,i) => {
        const x = padding + (i / (data.length - 1)) * (width - 2 * padding); 
        const y = height - padding - ((d.weight - minW) / range) * (height - 2 * padding);
        return `<circle cx="${x}" cy="${y}" r="3" fill="#10b981" class="dark:stroke-slate-900 stroke-white stroke-2"/>`;
    }).join('')}</svg>`;
}

export function renderWeight() {
    drawWeightChart();
    const container = document.getElementById('weight-history-container'); 
    const viewType = document.getElementById('weight-view-type').value; 
    container.innerHTML = '';
    
    if (appState.weightLog.length === 0) { 
        container.innerHTML = `<div class="text-center py-6 text-xs text-slate-400 italic p-4">No weigh-ins logged.</div>`; 
        return; 
    }

    if (viewType === 'all') {
        const sortedLogs = [...appState.weightLog].sort((a,b) => new Date(`${b.date}T${b.time || '00:00'}`) - new Date(`${a.date}T${a.time || '00:00'}`));
        sortedLogs.forEach(log => {
            const el = document.createElement('div'); 
            el.className = 'flex justify-between items-center py-3 px-4 border-b border-slate-50 dark:border-slate-800 last:border-0';
            el.innerHTML = `
                <div><div class="text-sm font-bold text-slate-800 dark:text-white">${log.date}</div><div class="text-[10px] font-bold text-slate-400">${formatTime12(log.time) || 'No Time'}</div></div>
                <div class="flex items-center gap-3"><div class="font-black text-slate-800 dark:text-white">${log.weight} <span class="text-[10px] text-slate-400 uppercase tracking-wider">lbs</span></div><button onclick="deleteWeightEntry(${log.id || 0})" class="text-slate-300 hover:text-red-500 p-1"><svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg></button></div>`;
            container.appendChild(el);
        });
    } else {
        const groupedData = groupData([...appState.weightLog].sort((a,b)=> new Date(a.date)-new Date(b.date)), viewType, 'weight');
        groupedData.forEach(log => {
            const el = document.createElement('div'); 
            el.className = 'flex justify-between items-center py-3 px-4 border-b border-slate-50 dark:border-slate-800 last:border-0';
            el.innerHTML = `<div class="text-sm font-bold text-slate-500 dark:text-slate-400">${log.display}</div><div class="font-black text-slate-800 dark:text-white">${log.avg} <span class="text-[10px] text-slate-400 uppercase tracking-wider">lbs</span></div>`;
            container.appendChild(el);
        });
    }
}

// ==========================================
// HISTORY RENDERING
// ==========================================

export function drawHistoryChart() {
    const container = document.getElementById('history-chart-container');
    const data = [...appState.history].sort((a,b) => new Date(a.date) - new Date(b.date)).slice(-7);
    if(data.length === 0) { 
        container.innerHTML = '<div class="h-full flex items-center justify-center text-xs text-slate-400 italic">No past history to graph.</div>'; 
        return; 
    }
    
    const maxC = Math.max(...data.map(d=>d.totals.cal), appState.targets.cal); 
    const width = 300; const height = 100; const padding = 5; 
    const barWidth = ((width - 2*padding) / data.length) - 6;
    
    let rects = data.map((d, i) => {
        const h = (d.totals.cal / maxC) * (height - 2*padding); 
        const x = padding + i * (barWidth + 6); 
        const y = height - padding - h;
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${d.totals.cal > appState.targets.cal ? '#ef4444' : '#3b82f6'}" rx="3"/>`;
    }).join('');
    
    const targetY = height - padding - ((appState.targets.cal / maxC) * (height - 2*padding));
    const targetLine = `<line x1="0" y1="${targetY}" x2="${width}" y2="${targetY}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 4" />`;
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" class="w-full h-full overflow-visible">${rects}${targetLine}</svg>`;
}

export function renderHistory() {
    drawHistoryChart();
    const container = document.getElementById('long-history-container'); 
    const viewType = document.getElementById('history-view-type').value; 
    container.innerHTML = '';
    
    if (appState.history.length === 0) { 
        container.innerHTML = `<div class="text-center py-6 text-xs text-slate-400 italic">No past history recorded yet.</div>`; 
        return; 
    }

    const groupedData = groupData([...appState.history].sort((a,b)=> new Date(a.date)-new Date(b.date)), viewType, 'totals');
    groupedData.forEach(day => {
        const card = document.createElement('div'); 
        card.className = 'bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-100 dark:border-slate-800';
        card.innerHTML = `
            <div class="flex justify-between items-center mb-2 border-b border-slate-50 dark:border-slate-800 pb-2"><span class="font-bold text-slate-800 dark:text-white text-sm">${day.display}</span><span class="font-black text-slate-900 dark:text-white">${day.avg} <span class="text-[10px] text-slate-400 uppercase tracking-wider">kcal</span></span></div>
            <div class="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider"><span>Pro: <strong class="text-slate-700 dark:text-slate-300">${day.p}g</strong></span><span>Carb: <strong class="text-slate-700 dark:text-slate-300">${day.c}g</strong></span><span>Fat: <strong class="text-slate-700 dark:text-slate-300">${day.f}g</strong></span></div>`;
        container.appendChild(card);
    });
}

// ==========================================
// GOALS & MACROS RENDERING
// ==========================================

export function applyEngineLockVisuals() {
    const isLocked = appState.settings.isCalLocked;
    const btnLock = document.getElementById('btn-lock-cal'); 
    const iconLock = document.getElementById('icon-lock'); 
    const iconUnlock = document.getElementById('icon-unlock'); 
    const calInput = document.getElementById('goal-engine-cal');
    
    if (isLocked) {
        iconUnlock.classList.add('hidden'); 
        iconLock.classList.remove('hidden'); 
        btnLock.classList.replace('bg-slate-100', 'bg-blue-50'); 
        btnLock.classList.add('border-blue-200'); 
        calInput.readOnly = true; 
        calInput.classList.add('bg-slate-100', 'text-blue-500'); 
        document.getElementById('lock-hint').classList.remove('hidden');
    } else {
        iconLock.classList.add('hidden'); 
        iconUnlock.classList.remove('hidden'); 
        btnLock.classList.replace('bg-blue-50', 'bg-slate-100'); 
        btnLock.classList.remove('border-blue-200'); 
        calInput.readOnly = false; 
        calInput.classList.remove('bg-slate-100', 'text-blue-500'); 
        document.getElementById('lock-hint').classList.add('hidden');
    }
}

export function renderGoalsForm() {
    document.getElementById('goal-weight').value = appState.settings.goalWeight; 
    document.getElementById('goal-rate').value = appState.settings.rate; 
    document.getElementById('goal-tdee').value = appState.settings.tdee;
    
    document.getElementById('goal-engine-cal').value = appState.targets.cal; 
    document.getElementById('goal-engine-p').value = appState.targets.p; 
    document.getElementById('goal-engine-c').value = appState.targets.c; 
    document.getElementById('goal-engine-f').value = appState.targets.f;
    
    applyEngineLockVisuals(); 
    if (window.handleMacroChange) window.handleMacroChange('init');
}

// ==========================================
// SCANNER & CAMERA (ZXing)
// ==========================================

let codeReader = null;
let originalConsoleWarn = null;

export async function startLiveScanner() {
    // 1. SILENT INTERCEPTOR: Block ZXing's console spam without breaking other logs
    if (!originalConsoleWarn) {
        originalConsoleWarn = console.warn;
        console.warn = function(...args) {
            if (args[0] && typeof args[0] === 'string' && args[0].includes('non-ReaderException')) return;
            originalConsoleWarn.apply(console, args);
        };
    }

    document.getElementById('scanner-buttons').classList.add('hidden');
    document.getElementById('scanner-video-container').classList.remove('hidden');
    document.getElementById('scanner-status').classList.remove('hidden');
    document.getElementById('scanner-status').textContent = "Initializing camera...";

    if (!codeReader) {
        // 2. SPEED FIX: Restrict formats to 1D barcodes only so the CPU doesn't choke
        const hints = new Map();
        const formats = [
            window.ZXing.BarcodeFormat.EAN_13,
            window.ZXing.BarcodeFormat.EAN_8,
            window.ZXing.BarcodeFormat.UPC_A,
            window.ZXing.BarcodeFormat.UPC_E,
            window.ZXing.BarcodeFormat.CODE_128
        ];
        hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        codeReader = new window.ZXing.BrowserMultiFormatReader(hints);
    }

    try {
        const videoInputDevices = await codeReader.listVideoInputDevices();
        
        const rearCamera = videoInputDevices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('environment')
        );
        const selectedDeviceId = rearCamera ? rearCamera.deviceId : videoInputDevices[videoInputDevices.length - 1].deviceId;

        document.getElementById('scanner-status').textContent = "Point camera at barcode...";

        let isScanning = true; 

        codeReader.decodeFromVideoDevice(selectedDeviceId, 'scanner-video', async (result, err) => {
            if (result && isScanning) {
                isScanning = false; 
                stopScanner();      
                
                document.getElementById('scanner-status').classList.remove('hidden');
                document.getElementById('scanner-status').textContent = "Fetching nutrition data...";
                
                const barcode = result.text;
                try {
                    // Quick inline fetch to avoid circular imports
                    const fetchPromise = fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`).then(res => res.json());
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
                    
                    const data = await Promise.race([fetchPromise, timeoutPromise]);

                    if (data.status === 1) {
                        const nut = data.product.nutriments;
                        populateNewFoodForm(
                            data.product.product_name || "Scanned Food", 
                            100, "g", 
                            nut['energy-kcal_100g'] || 0, 
                            nut.proteins_100g || 0, 
                            nut.carbohydrates_100g || 0, 
                            nut.fat_100g || 0
                        );
                        
                        if (navigator.vibrate) navigator.vibrate(50); 
                        alert("Food found and added to entry form!");
                    } else { 
                        alert("Barcode not found in OpenFoodFacts database."); 
                    }
                } catch (fetchErr) {
                    alert("Network error or timeout while fetching food data.");
                } finally {
                    document.getElementById('scanner-status').classList.add('hidden');
                    document.getElementById('smart-scanner-modal').classList.add('hidden');
                }
            }
        });
    } catch (err) {
        stopScanner();
        alert("Camera error: " + err.message);
    }
}

export function stopScanner() {
    if(codeReader) {
        codeReader.reset();
    }
    
    const video = document.getElementById('scanner-video');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    document.getElementById('scanner-video-container').classList.add('hidden');
    document.getElementById('scanner-buttons').classList.remove('hidden');
    document.getElementById('scanner-status').classList.add('hidden');
}