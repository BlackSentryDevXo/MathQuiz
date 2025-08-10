// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// Tuning caps (anti-cheat)
const MAX_POINTS_PER_SECOND = 40;       // generous cap vs your real pace
const MIN_PLAY_MS = 2000;               // must play at least 2s
const MAX_RUN_MS = 15 * 60 * 1000;      // 15 minutes
const MAX_SCORE_ABS = 500000;           // absolute guardrail

// startRun: creates a server-side run doc with server timestamp + nonce
exports.startRun = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");

  const runRef = db.collection("runs").doc();
  const now = admin.firestore.Timestamp.now();
  const runData = {
    uid,
    createdAt: now,
    used: false
  };
  await runRef.set(runData);

  return { runId: runRef.id, serverTime: now.toMillis() };
});

// submitScore: validates run + time + caps, updates leaderboard best
exports.submitScore = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");

  const { runId, score, gamerTag } = data || {};
  if (!runId || typeof score !== "number" || score < 0 || score > MAX_SCORE_ABS) {
    throw new functions.https.HttpsError("invalid-argument", "Bad score payload.");
  }
  if (typeof gamerTag !== "string" || gamerTag.trim().length < 2 || gamerTag.length > 24) {
    throw new functions.https.HttpsError("invalid-argument", "Bad gamer tag.");
  }

  const runRef = db.collection("runs").doc(runId);
  const snap = await runRef.get();
  if (!snap.exists) throw new functions.https.HttpsError("failed-precondition", "Run not found.");
  const run = snap.data();

  if (run.uid !== uid) throw new functions.https.HttpsError("permission-denied", "Wrong owner.");
  if (run.used) throw new functions.https.HttpsError("failed-precondition", "Run already used.");

  const now = admin.firestore.Timestamp.now();
  const elapsedMs = now.toMillis() - run.createdAt.toMillis();
  if (elapsedMs < MIN_PLAY_MS || elapsedMs > MAX_RUN_MS) {
    throw new functions.https.HttpsError("failed-precondition", "Run duration out of bounds.");
  }

  // Sanity cap: points cannot exceed a generous rate
  const maxAllowed = Math.ceil((elapsedMs / 1000) * MAX_POINTS_PER_SECOND);
  if (score > maxAllowed) {
    throw new functions.https.HttpsError("failed-precondition", "Score exceeds allowed rate.");
  }

  // Mark run as used (idempotency)
  await runRef.update({ used: true, finishedAt: now, finalScore: score });

  // Upsert leaderboard best (server-side timestamp)
  const lbRef = db.collection("leaderboard").doc(uid);
  await db.runTransaction(async (tx) => {
    const lbDoc = await tx.get(lbRef);
    if (!lbDoc.exists || (lbDoc.exists && score > (lbDoc.data().score || 0))) {
      tx.set(lbRef, {
        uid,
        gamerTag: gamerTag.trim(),
        score,
        updatedAt: now
      }, { merge: true });
    } else {
      // Always keep gamerTag fresh
      tx.set(lbRef, { gamerTag: gamerTag.trim(), updatedAt: now }, { merge: true });
    }
  });

  return { ok: true };
});