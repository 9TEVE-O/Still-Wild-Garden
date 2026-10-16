import assert from "node:assert/strict";
import { isConfiguredScheduledToken, matchesScheduledBearer } from "../lib/security/scheduled-token.ts";

const secret = "test-scheduler-" + "X".repeat(32);

assert.equal(isConfiguredScheduledToken(undefined), false, "missing scheduler secret must fail closed");
assert.equal(isConfiguredScheduledToken(""), false, "empty scheduler secret must fail closed");
assert.equal(isConfiguredScheduledToken("tiny"), false, "short scheduler secret must fail closed");
assert.equal(isConfiguredScheduledToken("X".repeat(31)), false, "31 character secret must fail closed");
assert.equal(isConfiguredScheduledToken("X".repeat(32)), true, "32 character secret must be configurable");
assert.equal(matchesScheduledBearer(null, secret), false, "missing bearer must fail");
assert.equal(matchesScheduledBearer(`Bearer ${secret}`, secret), true, "correct bearer must pass");
assert.equal(matchesScheduledBearer(`Bearer ${secret.slice(0, -1)}Y`, secret), false, "wrong equal-length bearer must fail");
assert.equal(matchesScheduledBearer(`Bearer ${secret.slice(0, -1)}`, secret), false, "short candidate must fail");
assert.equal(matchesScheduledBearer(`Bearer ${secret}Y`, secret), false, "long candidate must fail");
assert.equal(matchesScheduledBearer(`Basic ${secret}`, secret), false, "wrong scheme must fail");
assert.equal(matchesScheduledBearer(`Bearer ${secret}`, "tiny"), false, "short configured secret must never authenticate");

console.log("PASS: 12 isolated scheduled-tick credential boundary assertions");
