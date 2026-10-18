/**
 * Restrained leaf-lighting tuning shared by authored and scanned foliage. The albedo lift is a
 * small linear multiplier rather than a colour replacement; the backlight is an additive,
 * view-and-sun-gated term in the material's emissive node, not a global exposure boost.
 */
export const FOLIAGE_LIGHTING_CONFIG = {
  /** Small linear lift to keep dark leaf albedos readable without flattening their shadows. */
  albedoLift: 1.12,
  /** Maximum leaf-only backlight contribution at full daylight. */
  backlightStrength: 0.14,
  /** Shapes the leaf's back-light response; larger values keep the effect more directional. */
  backlightPower: 1.35,
} as const;
