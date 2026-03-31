import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, serverTimestamp,
  query, orderBy, limit, startAfter, getDocs, where, getCountFromServer,
  deleteDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your real config
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
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// auth ready gate
let _resolve, _reject;
const ready = new Promise((res, rej) => { _resolve = res; _reject = rej; });

setPersistence(auth, browserLocalPersistence).catch(() => { });

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

  const cleanTag = cleanGamerTag(gamerTag);
  const tagKey = normalizeGamerTag(cleanTag);
  const lbRef = doc(db, "leaderboard", tagKey);

  await runTransaction(db, async (tx) => {
    const lbDoc = await tx.get(lbRef);
    const prev = lbDoc.exists() ? lbDoc.data() : null;

    const best = Math.max(prev?.score || 0, Math.max(0, Math.floor(score)));
    const nowMs = Date.now();
    const sortKey = best * 1e10 + nowMs;

    tx.set(lbRef, {
      ownerUid: uid,
      gamerTag: cleanTag,
      gamerTagKey: tagKey,
      score: best,
      updatedAt: serverTimestamp(),
      updatedAtMillis: nowMs,
      sortKey
    }, { merge: true });
  });
}

function cleanGamerTag(tag) {
  return String(tag || "Player").trim().replace(/\s+/g, " ").slice(0, 24);
}

function normalizeGamerTag(tag) {
  return cleanGamerTag(tag).toLowerCase();
}

// ------- Rank helpers (single-field count on sortKey) -------
async function getMyLeaderboardDoc() {
  await ready;
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const byUid = await getDocs(query(
    collection(db, "leaderboard"),
    where("ownerUid", "==", uid),
    limit(1)
  ));

  if (!byUid.empty) {
    const d = byUid.docs[0];
    return { id: d.id, ...d.data() };
  }

  const localTag = localStorage.getItem("gamerTag");
  if (!localTag) return null;

  const tagKey = normalizeGamerTag(localTag);
  const snap = await getDoc(doc(db, "leaderboard", tagKey));
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

async function updateGamerTag(newTag) {
  await ready;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const clean = cleanGamerTag(newTag);
  const newKey = normalizeGamerTag(clean);
  if (!clean) return;

  const current = await getMyLeaderboardDoc();
  const newRef = doc(db, "leaderboard", newKey);

  if (!current) {
    await setDoc(newRef, {
      ownerUid: uid,
      gamerTag: clean,
      gamerTagKey: newKey,
      score: 0,
      updatedAt: serverTimestamp(),
      updatedAtMillis: Date.now(),
      sortKey: 0
    }, { merge: true });
    return;
  }

  const best = Math.max(0, current.score || 0);
  const nowMs = Date.now();
  const sortKey = best * 1e10 + nowMs;

  await setDoc(newRef, {
    ownerUid: uid,
    gamerTag: clean,
    gamerTagKey: newKey,
    score: best,
    updatedAt: serverTimestamp(),
    updatedAtMillis: nowMs,
    sortKey
  }, { merge: true });

  if (current.id && current.id !== newKey) {
    await deleteDoc(doc(db, "leaderboard", current.id));
  }
}

export {
  app, analytics, auth, db, ready,
  updateGamerTag, loadTop, saveBestScore, getMyLeaderboardDoc, getMyRank
};