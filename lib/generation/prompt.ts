import type { Garment, IdentityCanon, NewShootInput } from "../data/types";

export function composeGenerationBrief(
  identity: IdentityCanon,
  garment: Garment,
  shoot: NewShootInput,
) {
  return [
    `Use ${identity.version} as the sole identity authority. Preserve facial proportions, skin tone, body proportions, age appearance, and characteristic features.`,
    `Use garment ${garment.sku} as the sole garment authority. Preserve its exact ${garment.color.toLowerCase()} color, silhouette, neckline, sleeve and hem length, seams, pattern, texture, and fit behavior.`,
    `Create a ${shoot.preset.toLowerCase()} fashion photograph. ${shoot.pose}. ${shoot.crop}. Output ${shoot.outputFormat}.`,
    "Do not beautify into a different person. Do not redesign the garment, change body shape, lighten skin, add unrequested accessories, text, logos, watermarks, or duplicate limbs.",
  ].join("\n\n");
}
