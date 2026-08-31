import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const VERTICALS_DIR = resolve(here, "../src/verticals");

/**
 * Every file that can put text into a guest's phone.
 *
 * Each vertical keeps its templates in `src/verticals/<slug>.sms.ts` — a file containing nothing
 * but sendable text — so this check stays mechanical as professions are added: a new vertical is
 * covered the moment its SMS file exists, with nothing to remember to register here. Prompt files
 * are deliberately excluded; a system prompt is never transmitted over SMS and is free to use
 * em dashes.
 */
const SMS_SOURCES = [resolve(here, "../src/lib/sms.ts"), ...readdirSync(VERTICALS_DIR).filter((f) => f.endsWith(".sms.ts")).map((f) => resolve(VERTICALS_DIR, f))];

/**
 * Guest SMS must stay inside GSM-7.
 *
 * SMS is billed per SEGMENT. A GSM-7 message fits 160 characters per segment; the moment a
 * single character falls outside that alphabet — a smart quote, an em dash, an ellipsis, an
 * emoji — the whole message is re-encoded as UCS-2 and the segment size drops to 70. A
 * one-character edit can therefore double or triple the cost of every confirmation text we
 * send, silently, with nothing visibly broken.
 *
 * This test reads the literal text out of sms.ts and fails if any of it is unsendable in
 * GSM-7. It checks the *strings*, not the file: comments and interpolation expressions are
 * excluded, because prose in a comment is never transmitted and `${...}` is code, not text.
 */

// GSM 03.38 basic set. Note \f and the escape characters are handled via the extension table.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå" +
  "Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Encodable, but each costs TWO GSM-7 characters. */
const GSM7_EXTENDED = "\f^{}\\[~]|€";

const GSM7 = new Set([...GSM7_BASIC, ...GSM7_EXTENDED, "\t"]);

/**
 * Pull every string literal out of TypeScript source.
 *
 * A hand-rolled scanner rather than a regex: it has to know whether a `//` is a comment or
 * part of a string, and has to drop `${...}` from template literals without dropping the text
 * around them. Returns [{ text, line }].
 */
function extractStringLiterals(source) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    // Comments: skipped entirely. Prose in a comment is never sent to anyone.
    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Quoted strings.
    if (c === '"' || c === "'") {
      const startLine = line;
      const quote = c;
      let text = "";
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          text += source[i + 1] === "n" ? "\n" : source[i + 1] === "t" ? "\t" : source[i + 1];
          i += 2;
          continue;
        }
        if (source[i] === "\n") line++;
        text += source[i];
        i++;
      }
      i++;
      out.push({ text, line: startLine });
      continue;
    }
    // Template literals: keep the literal text, drop every ${ ... } expression.
    if (c === "`") {
      const startLine = line;
      let text = "";
      i++;
      while (i < n && source[i] !== "`") {
        if (source[i] === "\\") {
          text += source[i + 1] === "n" ? "\n" : source[i + 1];
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          // Skip the expression, tracking brace depth so nested braces do not end it early.
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") depth--;
            else if (source[i] === "\n") line++;
            i++;
          }
          continue;
        }
        if (source[i] === "\n") line++;
        text += source[i];
        i++;
      }
      i++;
      out.push({ text, line: startLine });
      continue;
    }
    i++;
  }
  return out;
}

function describeChar(ch) {
  return `${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")})`;
}

test("every SMS string literal is encodable in GSM-7", () => {
  assert.ok(
    SMS_SOURCES.some((f) => f.endsWith(".sms.ts")),
    "no per-vertical SMS file found — every vertical's templates must be scanned, so this test failing open is itself the bug",
  );

  const offenders = [];
  let literalCount = 0;
  for (const file of SMS_SOURCES) {
    const name = file.split(/[\\/]/).pop();
    const literals = extractStringLiterals(readFileSync(file, "utf8"));
    literalCount += literals.length;
    for (const { text, line } of literals) {
      for (const ch of text) {
        if (!GSM7.has(ch)) offenders.push({ file: name, line, ch, text: text.slice(0, 60) });
      }
    }
  }
  assert.ok(literalCount > 0, "found no string literals — the scanner is broken, not the source");

  assert.deepEqual(
    offenders.map((o) => `${o.file}:${o.line} ${describeChar(o.ch)} in ${JSON.stringify(o.text)}`),
    [],
    "Non-GSM-7 characters found in SMS text. Each one forces the whole message to UCS-2, " +
      "cutting the segment size from 160 characters to 70 and multiplying the cost of every " +
      "affected text. Replace them with ASCII equivalents: — and – with -, … with ..., " +
      "curly quotes with straight ones.",
  );
});

test("the scanner actually detects the characters it is meant to catch", () => {
  // Guards against the test silently passing because the scanner stopped finding anything.
  const sample = [
    "const a = `Order received — items`;",
    "const b = 'plain ascii';",
    "// a comment with an em dash — which must be ignored",
    "const c = `total ${price} …`;",
  ].join("\n");

  const found = extractStringLiterals(sample)
    .flatMap(({ text }) => [...text])
    .filter((ch) => !GSM7.has(ch));

  assert.deepEqual(found, ["—", "…"], "scanner must catch literals and ignore comments and ${} expressions");
});

test("GSM-7 alphabet includes the characters the templates rely on", () => {
  for (const ch of "abcXYZ0123456789 !?.,:'()-/&+@$") {
    assert.ok(GSM7.has(ch), `expected ${describeChar(ch)} to be GSM-7`);
  }
  for (const ch of ["—", "–", "…", "’", "“", "🍕"]) {
    assert.ok(!GSM7.has(ch), `expected ${describeChar(ch)} to be rejected`);
  }
});
