// logic.js

export const STORAGE_KEY = 'macroTrackerPro_Data_v3';

export const DEFAULT_FOOD_DB = [
    { id: 1, category: "Proteins", name: "ON Whey Protein", serving: 1, unit: "scoop", cal: 120, p: 24, c: 3, f: 1 },
    { id: 2, category: "Dairy", name: "2% Greek Yogurt", serving: 170, unit: "g", cal: 120, p: 17, c: 5, f: 3 },
    { id: 3, category: "Fruits & Veg", name: "Mixed Berries", serving: 1, unit: "cup", cal: 70, p: 1, c: 15, f: 0.5 },
    { id: 4, category: "Proteins", name: "Chicken Breast (Raw)", serving: 4, unit: "oz", cal: 136, p: 26, c: 0, f: 2.8 },
    { id: 5, category: "Proteins", name: "93% Ground Beef (Raw)", serving: 4, unit: "oz", cal: 170, p: 24, c: 0, f: 8 },
    { id: 6, category: "Carbs", name: "Sweet Potatoes (Raw)", serving: 100, unit: "g", cal: 86, p: 1.6, c: 20, f: 0.1 },
    { id: 7, category: "Proteins", name: "Eggs (Whole)", serving: 1, unit: "piece", cal: 72, p: 6, c: 0.4, f: 4.8 },
    { id: 8, category: "Carbs", name: "Jasmine Rice (Dry)", serving: 0.25, unit: "cup", cal: 160, p: 3, c: 36, f: 0 },
    { id: 9, category: "Fats", name: "Avocado Oil", serving: 1, unit: "tbsp", cal: 120, p: 0, c: 0, f: 14 },
    { id: 10, category: "Carbs", name: "Oats (Dry)", serving: 0.5, unit: "cup", cal: 150, p: 5, c: 27, f: 3 },
    { id: 11, category: "Fats", name: "Peanut Butter", serving: 2, unit: "tbsp", cal: 190, p: 7, c: 8, f: 16 },
    { id: 12, category: "Fruits & Veg", name: "Banana", serving: 1, unit: "piece", cal: 105, p: 1.3, c: 27, f: 0.3 }
];

export let appState = {
    lastActiveDate: "", 
    targets: { cal: 2000, p: 150, c: 200, f: 67 },
    settings: { goalWeight: '', rate: '-1', tdee: '', isCalLocked: false },
    totals: { cal: 0, p: 0, c: 0, f: 0 },
    diary: [], 
    history: [], 
    foodDatabase: [...DEFAULT_FOOD_DB], 
    weightLog: [] 
};

// --- STATE MANAGEMENT ---

export function setAppState(newState) {
    appState = {
        ...newState,
        targets: newState.targets || { cal: 2000, p: 150, c: 200, f: 67 },
        settings: newState.settings || { goalWeight: '', rate: '-1', tdee: '', isCalLocked: false },
        history: newState.history || [], 
        weightLog: newState.weightLog || [],
        foodDatabase: newState.foodDatabase || [...DEFAULT_FOOD_DB]
    };
}

export function saveLocalState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

export function loadLocalState() {
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        setAppState(JSON.parse(localData));
        return true;
    }
    return false;
}

// --- DATE & TIME UTILITIES ---

export function getFormattedDateString() { 
    const d = new Date(); 
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; 
}

export function formatTime12(time24) { 
    if(!time24) return ""; 
    let [h, m] = time24.split(':'); 
    h = parseInt(h); 
    const ampm = h >= 12 ? 'PM' : 'AM'; 
    h = h % 12 || 12; 
    return `${h}:${m.padStart(2, '0')} ${ampm}`; 
}

export function getWeekStartString(dateStr) { 
    const d = new Date(dateStr + 'T12:00:00'); 
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const mon = new Date(d.setDate(diff)); 
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`; 
}

// --- DATA PROCESSING ---

export function groupData(dataArray, groupingType, valueKey) {
    const groups = {};
    dataArray.forEach(item => {
        let key = item.date; 
        let displayKey = item.date;

        if (groupingType === 'weekly') { 
            key = getWeekStartString(item.date); 
            displayKey = `Week of ${key}`; 
        } else if (groupingType === 'monthly') { 
            key = item.date.substring(0, 7); 
            displayKey = key; 
        }

        if (!groups[key]) {
            groups[key] = { display: displayKey, sum: 0, count: 0 };
            if (valueKey === 'totals') { 
                groups[key].p = 0; groups[key].c = 0; groups[key].f = 0; 
            }
        }
        
        if (valueKey === 'weight') { 
            groups[key].sum += item.weight; 
        } else if (valueKey === 'totals') {
            groups[key].sum += item.totals.cal; 
            groups[key].p += item.totals.p;
            groups[key].c += item.totals.c; 
            groups[key].f += item.totals.f;
        }
        groups[key].count++;
    });

    return Object.values(groups).map(g => {
        const result = { display: g.display, avg: Math.round((g.sum / g.count)*10)/10 };
        if (valueKey === 'totals') {
            result.p = Math.round(g.p / g.count); 
            result.c = Math.round(g.c / g.count); 
            result.f = Math.round(g.f / g.count);
        }
        return result;
    }).reverse();
}


// --- CACHE & LOAD STATE ---
// logic.js
export async function loadInitialData() {
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        setAppState(JSON.parse(localData));
        return true;
    }
    return false;
}

// --- DAY DATA MANAGEMENT ---
export function getActiveDayData(dateString) {
    const monthKey = dateString.substring(0, 7);
    
    // Safely check for appState.logs
    if (appState.logs && appState.logs[monthKey] && appState.logs[monthKey][dateString]) {
        return appState.logs[monthKey][dateString];
    }
    
    // Default return if data isn't loaded yet
    return {
        date: dateString,
        diary: [],
        totals: { cal: 0, p: 0, c: 0, f: 0 },
        weight: null
    };
}

export async function saveActiveDayData(dateString, dayData) {
    const monthKey = dateString.substring(0, 7);
    
    // Initialize the month object if it doesn't exist yet
    if (!appState.logs[monthKey]) {
        appState.logs[monthKey] = {};
    }
    
    // Optimistic UI Update: Write to memory and local storage instantly
    appState.logs[monthKey][dateString] = dayData;
    saveLocalState(); 

    // Background Cloud Sync (Pass the date string so API knows WHICH month to sync)
    const user = auth.currentUser; // Assuming auth is imported in logic.js or passed in
    if (user) {
        // Fire and forget - don't await so UI doesn't block
        syncStateToCloud(user.uid, dateString); 
    }
}

// --- MACRO ENGINE CALCULATIONS ---

export function calculateMacros(trigger, currentCal, currentP, currentC, currentF, isLocked) {
    let cal = currentCal || 0; 
    let p = currentP || 0; 
    let c = currentC || 0; 
    let f = currentF || 0;

    if (trigger === 'cal' || trigger === 'tdee') {
        if (p === 0 && c === 0 && f === 0) { 
            p = Math.round((cal * 0.3) / 4); 
            c = Math.round((cal * 0.4) / 4); 
            f = Math.round((cal * 0.3) / 9); 
        } else { 
            const currentTotal = (p * 4) + (c * 4) + (f * 9); 
            const ratio = cal / currentTotal; 
            p = Math.round(p * ratio); 
            c = Math.round(c * ratio); 
            f = Math.round(f * ratio); 
        }
        cal = (p * 4) + (c * 4) + (f * 9); 
    } else if (!isLocked) { 
        cal = (p * 4) + (c * 4) + (f * 9); 
    } else {
        if (trigger === 'p' || trigger === 'f') { 
            const remaining = cal - ((p * 4) + (f * 9)); 
            c = Math.max(0, Math.round(remaining / 4)); 
        } else if (trigger === 'c') { 
            const remaining = cal - ((p * 4) + (c * 4)); 
            f = Math.max(0, Math.round(remaining / 9)); 
        }
    }

    const realTotal = (p*4) + (c*4) + (f*9) || 1;
    const pctP = Math.round(((p*4)/realTotal)*100);
    const pctC = Math.round(((c*4)/realTotal)*100);
    const pctF = Math.round(((f*9)/realTotal)*100);

    return { cal, p, c, f, pctP, pctC, pctF, realTotal };
}