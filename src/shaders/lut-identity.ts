import { Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';

/**
 * The 3D texture a look is sampled from — created empty, filled later, never rebuilt.
 *
 * Two facts about this project's use of a 3D LUT drive the whole module:
 *
 * 1. **The look is an asset, and assets arrive late.** The `.cube` is fetched after the renderer is
 *    running. Rebuilding the node graph when it lands would stall a frame at the worst possible
 *    moment, so the texture exists from the first frame and its *contents* change instead. A texture
 *    whose data is replaced and which is marked `needsUpdate` is re-uploaded by the renderer with no
 *    graph surgery — the node keeps pointing at the same object.
 * 2. **The identity is a meaningful default, not a placeholder.** Filled with the identity table, the
 *    lookup returns its own input, which is exactly what "no look" means. So a fetch that fails, is
 *    slow, or is never requested all produce a correctly rendered, ungraded frame — there is no state
 *    in which the renderer is waiting for colour.
 */

/** Bytes per entry in the GPU texture: three channels of data and one of padding the driver wants. */
const CHANNELS = 4;

/**
 * A `size³` identity table as an uploadable texture.
 *
 * Format is RGBA because an 8-bit 3D texture is stored that way by every backend three targets; the
 * alpha channel is unused but not optional. Filtering is linear on all three axes, which is what turns
 * a 17-entry lattice into a continuous transform — nearest sampling would posterise the frame into 17
 * flat levels per channel. No colour space is set, deliberately: the table is not an image, it is a
 * function's sampled outputs, and a transfer curve would be applied to it twice.
 */
export function createLookTexture(size: number): Data3DTexture {
  const texture = new Data3DTexture(
    new Uint8Array(size * size * size * CHANNELS),
    size,
    size,
    size,
  );
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  fillIdentity(texture, size);
  return texture;
}

/**
 * Replaces the texture's contents with a table from a `.cube`, in place.
 *
 * `table` is the RGB layout a `.cube` holds — one entry per lattice point, red varying fastest — and
 * the destination is the RGBA layout the GPU wants. The conversion is done here rather than by the
 * loader so the loader stays about *reading a format* and this stays about *what the GPU needs*.
 *
 * The size is not taken on trust. A table of a different size would be sampled with the wrong
 * coordinates and would produce a subtly wrong grade — a class of bug that survives every screenshot
 * review, because a wrong look still looks like a look. Mismatches throw, and the caller decides what
 * to do about it.
 */
export function writeLookTable(texture: Data3DTexture, table: Uint8Array, size: number): void {
  const expected = size * size * size * 3;
  if (table.length !== expected) {
    throw new Error(
      `look table: expected ${expected} bytes for a ${size}³ RGB table, received ${table.length}`,
    );
  }
  if (texture.image.width !== size) {
    throw new Error(
      `look table: texture is ${texture.image.width}³ but the table is ${size}³ — the table would be ` +
        'sampled with the wrong coordinates and the resulting grade would be wrong in a way that is ' +
        'invisible in a screenshot',
    );
  }

  const data = requireData(texture);
  for (let index = 0; index < size ** 3; index += 1) {
    data[index * CHANNELS] = table[index * 3] ?? 0;
    data[index * CHANNELS + 1] = table[index * 3 + 1] ?? 0;
    data[index * CHANNELS + 2] = table[index * 3 + 2] ?? 0;
    data[index * CHANNELS + 3] = 255;
  }
  texture.needsUpdate = true;
}

/**
 * The texture's byte array, or a thrown error.
 *
 * `Data3DTexture.image.data` is typed as nullable because a texture can be constructed before its data
 * is attached. This module only ever deals with ones that were constructed *with* data, so a null here
 * would be a programming error several frames up, and silently writing to nothing would hide it.
 */
function requireData(texture: Data3DTexture): Uint8Array {
  const data = texture.image.data;
  if (data === null || data === undefined) {
    throw new Error('look texture: constructed without data');
  }
  return data as Uint8Array;
}

/** Writes the identity lattice: entry `(r,g,b)` maps to itself, quantised the way the table is. */
function fillIdentity(texture: Data3DTexture, size: number): void {
  const data = requireData(texture);
  const last = Math.max(1, size - 1);
  let offset = 0;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        data[offset] = Math.round((r / last) * 255);
        data[offset + 1] = Math.round((g / last) * 255);
        data[offset + 2] = Math.round((b / last) * 255);
        data[offset + 3] = 255;
        offset += CHANNELS;
      }
    }
  }
  texture.needsUpdate = true;
}
