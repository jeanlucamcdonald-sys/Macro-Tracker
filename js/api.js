// api.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { appState } from './logic.js';


// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDFghUuWeunz4lPrL-PKYH7pVVPXNt65A0",
    authDomain: "cal-tracker-70796.firebaseapp.com",
    projectId: "cal-tracker-70796",
    storageBucket: "cal-tracker-70796.firebasestorage.app",
    messagingSenderId: "946536046238",
    appId: "1:946536046238:web:c0e944c7f8a830bea6e58f",
    measurementId: "G-EKJ3KQ8SV0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
    prompt: 'select_account'
});

// --- AUTHENTICATION ---
export async function loginUser() {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        console.error("Login failed:", error.message);
        throw error;
    }
}

export async function logoutUser() {
    try {
        await signOut(auth);
        localStorage.removeItem('macroTrackerPro_Data_v3'); // Force clean state
        window.location.reload(); // Hard reset to ensure memory is cleared
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

// --- FIRESTORE DATA SYNC ---
// --- IDEMPOTENT MIGRATION SCRIPT ---
async function runIdempotentMigration(userId, coreData) {
    // 1. Check the idempotent flag
    if (coreData.migrated === true) return false;
    
    // 2. Check if there's actually anything to migrate
    if (!coreData.history || !Array.isArray(coreData.history) || coreData.history.length === 0) {
        await setDoc(doc(db, "users", userId), { migrated: true }, { merge: true });
        return false;
    }

    console.log("Running one-time history migration...");
    const batch = writeBatch(db);
    const coreDocRef = doc(db, "users", userId);
    const monthlyLogs = {};

    // 3. Transform array into YYYY-MM document structures
    coreData.history.forEach(day => {
        const monthKey = day.date.substring(0, 7); // Extracts "YYYY-MM"
        if (!monthlyLogs[monthKey]) monthlyLogs[monthKey] = { days: {} };
        monthlyLogs[monthKey].days[day.date] = day;
    });

    // 4. Queue up the new subcollection writes
    for (const [monthKey, data] of Object.entries(monthlyLogs)) {
        const monthDocRef = doc(db, `users/${userId}/logs`, monthKey);
        batch.set(monthDocRef, data, { merge: true });
    }

    // 5. Flag as migrated and delete the massive old array to free space
    batch.update(coreDocRef, {
        migrated: true,
        history: deleteField()
    });

    await batch.commit();
    console.log("Migration complete.");
    return true; // Indicates migration ran
}

// --- EAGER FETCH ON LOGIN ---
export async function fetchStateFromCloud(userId) {
    try {
        const coreDocRef = doc(db, "users", userId);
        const coreSnap = await getDoc(coreDocRef);
        
        if (!coreSnap.exists()) return null; // New user
        
        let coreData = coreSnap.data();
        
        // Run migration silently if needed
        const didMigrate = await runIdempotentMigration(userId, coreData);
        if (didMigrate) {
            // Re-fetch core data if migration altered it
            coreData = (await getDoc(coreDocRef)).data(); 
        }

        // Determine Eager Fetch Months (Current & Previous)
        const date = new Date();
        const currentMonthKey = date.toISOString().substring(0, 7);
        date.setMonth(date.getMonth() - 1);
        const prevMonthKey = date.toISOString().substring(0, 7);

        // Fetch logs
        const currentMonthSnap = await getDoc(doc(db, `users/${userId}/logs`, currentMonthKey));
        const prevMonthSnap = await getDoc(doc(db, `users/${userId}/logs`, prevMonthKey));

        return {
            settings: coreData.settings || {},
            targets: coreData.targets || {},
            foodDatabase: coreData.foodDatabase || [],
            logs: {
                [currentMonthKey]: currentMonthSnap.exists() ? currentMonthSnap.data().days : {},
                [prevMonthKey]: prevMonthSnap.exists() ? prevMonthSnap.data().days : {}
            },
            lastFetch: Date.now() // Timestamp for our local cache logic
        };
    } catch (err) {
        console.error("Error fetching state:", err);
        throw err;
    }
}

// --- OPTIMIZED SYNC ---
export async function syncStateToCloud(userId, activeDateString, stateToSync) {
    // Use stateToSync instead of the imported appState
    await setDoc(doc(db, "users", userId), {
        settings: stateToSync.settings,
        // ... rest of your code
    }, { merge: true });
}
// --- EXTERNAL APIs ---

export async function fetchFoodByBarcode(barcode) {
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await res.json();

        if (data.status === 1) {
            return data.product;
        }
        throw new Error("Product not found in OpenFoodFacts database");
    } catch (err) {
        console.error("API Error:", err);
        throw err;
    }
}

export async function processLabelWithGemini(base64Data, mimeType, apiKey) {
    try {
        const payload = {
            contents: [{
                parts: [
                    { text: "Extract the nutrition facts. Return ONLY a raw JSON object (no markdown formatting, no backticks). Keys must be exactly: name, serving_g, cal, pro, carb, fat. If the food name is missing, use 'Scanned Label'. Ensure macros are numbers." },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
            }]
        };

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error.message);

        let rawJson = data.candidates[0].content.parts[0].text;
        rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(rawJson);
        
    } catch (err) {
        console.error("AI OCR Error:", err);
        throw err;
    }
}