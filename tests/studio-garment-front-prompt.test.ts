import assert from "node:assert/strict";
import test from "node:test";
import { buildGarmentFrontPrompt, studioGatewayPolicy } from "../lib/ai/studio-gateway";

test("garment-front prompt locks visible source construction and advances its fingerprint version", () => {
  const prompt = buildGarmentFrontPrompt({
    facts: {
      title: "Black V-neck dress with dolman sleeves and cut-out hem",
      category: "Dress",
      colour: "Black",
    },
  });

  assert.equal(studioGatewayPolicy.promptVersion, "garment-front-v2");
  assert.match(prompt, /source image as the primary construction authority/);
  assert.match(prompt, /sleeve cut, sleeve length and volume/);
  assert.match(prompt, /waist seam or gathering/);
  assert.match(prompt, /garment length and hem treatment/);
  assert.match(prompt, /Preserve the visible fabric surface and drape/);
  assert.match(prompt, /never infer or name a material or fibre composition/);
  assert.match(prompt, /Never turn a dolman or batwing sleeve into a long or puff sleeve/);
  assert.match(prompt, /never remove a visible gathered or elastic waist/);
  assert.match(prompt, /no person, mannequin, hanger, text, logo, label, brand tag/);
  assert.match(prompt, /"title":"Black V-neck dress with dolman sleeves and cut-out hem"/);
});
