// api.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    } catch (error) {
        console.error("Logout failed:", error.message);
        throw error;
    }
}

// --- FIRESTORE DATA SYNC ---
export async function syncStateToCloud(userId, appState) {
    try {
        await setDoc(doc(db, "users", userId), appState);
    } catch (e) {
        console.error("Cloud Sync Error:", e);
        throw e;
    }
}

export async function fetchStateFromCloud(userId) {
    try {
        const docRef = doc(db, "users", userId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (e) {
        console.error("Cloud Fetch Error:", e);
        throw e;
    }
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