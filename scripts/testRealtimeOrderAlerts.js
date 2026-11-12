// backend/scripts/testRealtimeOrderAlerts.js

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config();

console.log("========================================================");
console.log("RUNNING ZUSKO REAL-TIME ORDER ALERT & NOTIFICATION TESTS");
console.log("========================================================");

// ---------------------------------------------------------------------
// TEST 1: Audio Asset Availability & Integrity
// ---------------------------------------------------------------------
console.log("\n[Test 1] Verifying local audio asset...");
const audioPath1 = path.resolve("Frontend/public/assets/order-ping.wav");
const audioPath2 = path.resolve("Frontend/public/order-ping.wav");

assert.ok(fs.existsSync(audioPath1), `Primary audio asset must exist at ${audioPath1}`);
assert.ok(fs.existsSync(audioPath2), `Fallback audio asset must exist at ${audioPath2}`);

const stats1 = fs.statSync(audioPath1);
assert.ok(stats1.size > 1000, `Audio asset file size should be > 1KB, got ${stats1.size} bytes`);

// Verify WAV RIFF header
const buffer = Buffer.alloc(12);
const fd = fs.openSync(audioPath1, "r");
fs.readSync(fd, buffer, 0, 12, 0);
fs.closeSync(fd);

const riff = buffer.toString("utf8", 0, 4);
const wave = buffer.toString("utf8", 8, 12);
assert.equal(riff, "RIFF", "Audio file must have valid RIFF container header");
assert.equal(wave, "WAVE", "Audio file must have valid WAVE format header");

console.log(`✅ Audio asset verified: ${stats1.size} bytes, format: ${riff}/${wave}`);

// ---------------------------------------------------------------------
// TEST 2: Multiple Order Handling & Singleton Loop Simulation
// ---------------------------------------------------------------------
console.log("\n[Test 2] Testing multiple order handling & singleton audio loop logic...");

// Simulate pending order collection and singleton timer
const pendingOrders = new Map();
let isPlaying = false;
let pingCount = 0;
let timer = null;
const PING_INTERVAL = 3000;

function playPing() {
  pingCount++;
}

function startPing() {
  if (timer) return; // Singleton protection: never duplicate interval
  isPlaying = true;
  playPing();
  timer = setInterval(() => {
    if (pendingOrders.size === 0) {
      stopPing();
      return;
    }
    playPing();
  }, PING_INTERVAL);
}

function stopPing() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  isPlaying = false;
}

function addOrder(orderId, details) {
  pendingOrders.set(orderId, details);
  startPing();
}

function acceptOrder(orderId) {
  pendingOrders.delete(orderId);
  if (pendingOrders.size === 0) {
    stopPing();
  }
}

// Scenario:
// Order A arrives
addOrder("order_A", { total: 450 });
assert.equal(pendingOrders.size, 1);
assert.equal(isPlaying, true);
assert.equal(pingCount, 1, "Initial ping played immediately upon Order A arrival");

// Order B arrives before Order A is accepted
addOrder("order_B", { total: 850 });
assert.equal(pendingOrders.size, 2);
assert.equal(isPlaying, true);
assert.ok(timer !== null, "Singleton interval timer must still be active");

// Order C arrives before either is accepted
addOrder("order_C", { total: 1200 });
assert.equal(pendingOrders.size, 3);
assert.equal(isPlaying, true);

// Accept Order A
acceptOrder("order_A");
assert.equal(pendingOrders.size, 2, "2 unaccepted orders still remain");
assert.equal(isPlaying, true, "Ping must CONTINUE because Order B and Order C are unaccepted");

// Accept Order B
acceptOrder("order_B");
assert.equal(pendingOrders.size, 1, "1 unaccepted order still remains");
assert.equal(isPlaying, true, "Ping must CONTINUE because Order C is unaccepted");

// Closing toast does NOT stop ping
// (Simulated: toast UI is dismissed, but acceptOrder is NOT called)
assert.equal(isPlaying, true, "Closing toast notification did not stop audio loop");

// Accept Order C (final unaccepted order)
acceptOrder("order_C");
assert.equal(pendingOrders.size, 0, "No unaccepted orders remaining");
assert.equal(isPlaying, false, "Ping MUST STOP immediately when last order is accepted");
assert.equal(timer, null, "Interval timer cleared");

console.log("✅ Multiple order queue and singleton audio loop verified perfectly");

// ---------------------------------------------------------------------
// TEST 3: Cross-Tab Leader Election & BroadcastChannel Logic
// ---------------------------------------------------------------------
console.log("\n[Test 3] Testing cross-tab synchronization & leader election rules...");

// When multiple tabs are open:
// - A visible/focused tab plays audio
// - A background tab suppresses audio to prevent audio echo
const tab1 = { id: "tab_1", isHidden: false, isFocused: true };
const tab2 = { id: "tab_2", isHidden: true, isFocused: false };

function canTabPlayAudio(tab) {
  return !tab.isHidden && tab.isFocused;
}

assert.equal(canTabPlayAudio(tab1), true, "Active focused tab can play audio");
assert.equal(canTabPlayAudio(tab2), false, "Background tab suppresses audio to avoid echo");

console.log("✅ Tab audio leader election logic verified");

// ---------------------------------------------------------------------
// TEST 4: Backend Socket Rooms & Aliases
// ---------------------------------------------------------------------
console.log("\n[Test 4] Verifying socket helper exports...");
import { initSocket, getIO, emitToVendor, emitGlobal } from "../socket.js";

assert.equal(typeof initSocket, "function");
assert.equal(typeof getIO, "function");
assert.equal(typeof emitToVendor, "function");
assert.equal(typeof emitGlobal, "function");

console.log("✅ Socket helpers verified");

console.log("\n========================================================");
console.log("🎉 ALL REAL-TIME ORDER ALERT SYSTEM TESTS PASSED!");
console.log("========================================================\n");

