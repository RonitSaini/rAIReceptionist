import { test } from "node:test";
import assert from "node:assert/strict";
import { retellSipDomain, sipUriForCall } from "../src/lib/retell.ts";

/**
 * The SIP host guard.
 *
 * Retell retired the LiveKit-fronted SIP edge on 2026-09-30. Nothing in this repo ever named it —
 * the constant has been `sip.retellai.com` since the first commit — but `RETELL_SIP_DOMAIN` can
 * override the constant from the environment, and a wrong value there is invisible: valid TwiML,
 * a dialed leg, a "completed" status, and silence on every inbound call at once. These tests pin
 * the two halves of the guard: which overrides are honoured, and that a refusal is both loud and
 * safe (it falls back to a host that works rather than dialing a broken one).
 */

const CONSTANT = "sip.retellai.com";

/** Run `fn` with RETELL_SIP_DOMAIN set (or removed, for `undefined`), capturing console.error. */
function withDomain(value, fn) {
  const had = Object.hasOwn(process.env, "RETELL_SIP_DOMAIN");
  const previous = process.env.RETELL_SIP_DOMAIN;
  const realError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(" "));
  try {
    if (value === undefined) delete process.env.RETELL_SIP_DOMAIN;
    else process.env.RETELL_SIP_DOMAIN = value;
    return { result: fn(), errors };
  } finally {
    console.error = realError;
    if (had) process.env.RETELL_SIP_DOMAIN = previous;
    else delete process.env.RETELL_SIP_DOMAIN;
  }
}

test("with no override, the constant answers", () => {
  const { result, errors } = withDomain(undefined, retellSipDomain);
  assert.equal(result, CONSTANT);
  assert.deepEqual(errors, [], "a missing override is the normal case and must not warn");
});

test("an empty or whitespace override is treated as absent, not as a bad value", () => {
  for (const blank of ["", "   ", "\t"]) {
    const { result, errors } = withDomain(blank, retellSipDomain);
    assert.equal(result, CONSTANT, `blank ${JSON.stringify(blank)} should fall back silently`);
    assert.deepEqual(errors, [], "blank is how an unset variable arrives; it is not a misconfiguration");
  }
});

test("a genuine Retell host is honoured", () => {
  for (const host of ["sip.retellai.com", "retellai.com", "eu.sip.retellai.com", "SIP.RETELLAI.COM"]) {
    const { result, errors } = withDomain(host, retellSipDomain);
    assert.equal(result, host, `${host} is Retell's and must be dialed as given`);
    assert.deepEqual(errors, [], `${host} is valid and must not warn`);
  }
});

test("the retired LiveKit host is refused and falls back to the constant", () => {
  const { result, errors } = withDomain("5t4n6j0wnrl.sip.livekit.cloud", retellSipDomain);
  assert.equal(result, CONSTANT, "the dead endpoint must never be dialed");
  assert.equal(errors.length, 1, "a refusal has to be loud");
  assert.match(errors[0], /REFUSED/);
  assert.match(errors[0], /livekit\.cloud/, "the refused value belongs in the message, or it cannot be fixed");
});

test("look-alike domains do not pass as Retell's", () => {
  // The whole point of the check: `endsWith("retellai.com")` would wave the first two through.
  for (const host of ["notretellai.com", "myretellai.com", "sip.retellai.com.attacker.example", "retellai.com.evil.net"]) {
    const { result, errors } = withDomain(host, retellSipDomain);
    assert.equal(result, CONSTANT, `${host} is not Retell's and must be refused`);
    assert.equal(errors.length, 1, `${host} must warn`);
  }
});

test("anything that is not a bare hostname is refused", () => {
  // A scheme, a port, a transport parameter or a path would all produce a malformed SIP URI.
  for (const host of ["sip:sip.retellai.com", "sip.retellai.com:5060", "sip.retellai.com;transport=tcp", "sip.retellai.com/path", "sip retellai com", "-sip.retellai.com"]) {
    const { result, errors } = withDomain(host, retellSipDomain);
    assert.equal(result, CONSTANT, `${host} is not a bare hostname and must be refused`);
    assert.equal(errors.length, 1, `${host} must warn`);
  }
});

test("sipUriForCall builds sip:{call_id}@{host} and logs the host it dialed", () => {
  const realLog = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(" "));
  try {
    const { result } = withDomain(undefined, () => sipUriForCall("call_abc123"));
    assert.equal(result, `sip:call_abc123@${CONSTANT}`);
    assert.equal(lines.length, 1, "exactly one line per dialed call");
    assert.match(lines[0], /\[retell\] dialing call_abc123 at sip\.retellai\.com/);
  } finally {
    console.log = realLog;
  }
});

test("a refused override still yields a dialable URI on the constant", () => {
  const realLog = console.log;
  console.log = () => {};
  try {
    const { result } = withDomain("5t4n6j0wnrl.sip.livekit.cloud", () => sipUriForCall("call_xyz"));
    assert.equal(result, `sip:call_xyz@${CONSTANT}`, "refusing must degrade to a working host, not to a broken URI");
  } finally {
    console.log = realLog;
  }
});
