import assert from "node:assert/strict";
import { normalizePhoneE164 } from "../src/servicios/whatsapp.servicio.js";

const cases = [
  { raw: "+56 9 7341 0397", expected: "56973410397" },
  { raw: "+54 9 260 481 4785", expected: "5492604814785" },
  { raw: "+54 260 481 4785", expected: "542604814785" }
];

cases.forEach(({ raw, expected }) => {
  const got = normalizePhoneE164(raw);
  assert.strictEqual(got, expected, `Esperado ${expected} para ${raw}, pero obtuvimos ${got}`);
  console.log(`✅ ${raw} -> ${got}`);
});

console.log("Todos los casos de normalizePhoneE164 pasaron");
