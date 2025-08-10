import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, serverTimestamp,
  query, orderBy, limit, startAfter, getDocs, where, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⬇️ Your real config
const firebaseConfig = {
  apiKey: "AIzaSyAg_aoWodRLuBLOM3CRZKNsC2K5KND8wDo",
  authDomain: "math-brain-6a4ba.firebaseapp.com",
  projectId: "math-brain-6a4ba",
  storageBucket: "math-brain-6a4ba.firebasestorage.app",
  messagingSenderId: "208164968546",
  appId: "1:208164968546:web:23417b3eeb8acdb52f993b",
  measurementId: "G-XR0PDQEW05"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// auth ready gate
let _resolve, _reject;
const ready = new Promise((res, rej) => { _resolve = res; _reject = rej; });

setPersistence(auth, browserLocalPersistence).catch(()=>{});

onAuthStateChanged(
  auth,
  async (user) => {
    try {
      if (!user) await signInAnonymously(auth);
      _resolve(auth.currentUser);
    } catch (e) {
      console.error("[Auth] Anonymous sign-in failed:", e);
      _reject(e);
    }
  },
  (err) => { console.error("[Auth] onAuthStateChanged error:", err); _reject(err); }
);

// ------- Leaderboard reads (order by single-field sortKey) -------
async function loadTop(pageSize = 50, startAfterDoc = null) {
  const col = collection(db, "leaderboard");
  const q = startAfterDoc
    ? query(col, orderBy("sortKey", "desc"), startAfter(startAfterDoc), limit(pageSize))
    : query(col, orderBy("sortKey", "desc"), limit(pageSize));
  return await getDocs(q);
}

// ------- Save best score (client-side, with sortKey) -------
async function saveBestScore(score, gamerTag) {
  await ready;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  const ref = doc(db, "leaderboard", uid);

  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : null;

  const best = Math.max(0, Math.floor(score));
  if (!prev || best > (prev.score || 0)) {
    const nowMs = Date.now();
    // Encodes tie-break (newer > older) into a single comparable field
    const sortKey = best * 1e10 + nowMs;

    await setDoc(ref, {
      uid,
      gamerTag: (gamerTag || "Player").slice(0, 24),
      score: best,
      updatedAt: serverTimestamp(),   // display
      updatedAtMillis: nowMs,         // for sortKey derivation
      sortKey
    }, { merge: true });
  }
}

// ------- Rank helpers (single-field count on sortKey) -------
async function getMyLeaderboardDoc() {
  await ready;
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const ref = doc(db, "leaderboard", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function getMyRank() {
  const me = await getMyLeaderboardDoc();
  if (!me?.sortKey) return null;

  const col = collection(db, "leaderboard");
  const gtSnap = await getCountFromServer(query(col, where("sortKey", ">", me.sortKey)));
  const rank = Number(gtSnap.data().count) + 1;

  return { rank, score: me.score, gamerTag: me.gamerTag, updatedAt: me.updatedAt, sortKey: me.sortKey };
}

export {
  app, auth, db, ready,
  loadTop, saveBestScore, getMyLeaderboardDoc, getMyRank
};