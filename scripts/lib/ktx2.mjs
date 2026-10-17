/**
 * KTX2 texture encoding for the model pipeline.
 *
 * The plan (`PROJECT_PLAN.md` §9, deliverable 7) names KTX2 in the asset chain, and the runtime
 * genuinely needs it: `KHR_texture_basisu` is what the GPU transcodes to BC7/ASTC/ETC2, so a prop's
 * textures stay compressed in video memory instead of being decoded into a full 1K RGBA image. For a
 * streamed world holding hundreds of props, that is the difference between fitting and not.
 *
 * The usual way to get it is the KTX-Software CLI, which is not installable here and is an awkward
 * external dependency for anyone building this project. The Basis Universal encoder itself is
 * available as a platform binary through the `basisu` package, and it writes KTX2 directly, so the
 * encoder it is: no external toolchain, no network, no account.
 *
 * Two things about it are easy to get wrong and are handled here:
 *
 * - **Colour space.** The encoder assumes sRGB input by default, which is right for albedo and wrong
 *   for normals and packed maps — encoding a normal map as sRGB produces visible shading errors. The
 *   callers classify each texture and this module passes `-linear` (or `-normal_map`) accordingly.
 * - **Mipmaps.** Without them the GPU has nothing to sample below 1:1, so a tiled prop shimmers as it
 *   recedes. `-mipmap` makes the encoder write the pyramid into the KTX2 file.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KHRTextureBasisu } from '@gltf-transform/extensions';

const require = createRequire(import.meta.url);

/** Runs the encoder and resolves with its combined output. */
function runEncoder(binary, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise(output);
      } else {
        reject(
          new Error(`basisu exited ${code}:\n${output.trim().split('\n').slice(-6).join('\n')}`),
        );
      }
    });
  });
}

let availability = null;

/**
 * Checks the encoder is usable, once per process.
 *
 * The binary ships with its executable bit set, but this project has already been bitten by tooling
 * that arrives without one (a restored workspace strips permissions from `node_modules` too), so the
 * bit is reapplied defensively rather than assumed. Platform and architecture are the package's
 * business; this only has to answer "can this machine encode KTX2 right now".
 */
export async function basisuAvailable() {
  if (availability !== null) {
    return availability;
  }
  try {
    const binary = require('basisu').path;
    await chmod(binary, 0o755);
    const output = await runEncoder(binary, ['-version']);
    const version = /Basis Universal GPU Texture Compressor v([\d.]+)/.exec(output)?.[1];
    availability = version
      ? { ok: true, version: `Basis Universal ${version}`, path: binary }
      : { ok: false, reason: 'the encoder binary did not report a version' };
  } catch (error) {
    availability = { ok: false, reason: error.message };
  }
  return availability;
}

/**
 * Encodes every texture in a document to KTX2, in place.
 *
 * Returns the count so the manifest can record what happened, and requires the
 * `KHR_texture_basisu` extension: a glTF that carries KTX2 images without declaring the extension is
 * invalid, and writing one would produce a file that only this project could read.
 */
export async function encodeKtx2(document, options) {
  const { quality, linearPattern } = options;
  /** Normal maps get the encoder's dedicated treatment; see the note below. */
  const normalPattern = options.normalPattern ?? /norm|nor_gl|nor_dx/i;
  const { ok, path: binary } = await basisuAvailable();
  if (!ok) {
    throw new Error('cannot encode KTX2: the Basis encoder is unavailable');
  }

  const textures = document.getRoot().listTextures();
  if (textures.length === 0) {
    return { document, textures: 0 };
  }

  const directory = await mkdtemp(join(tmpdir(), 'endless-driver-ktx2-'));
  let encoded = 0;
  try {
    for (const [index, texture] of textures.entries()) {
      const image = texture.getImage();
      if (image === null) {
        continue;
      }
      // Poly Haven names its normal maps `..._nor_gl`, not `..._normal`, so the pattern has to match
      // the naming the archives actually use rather than the naming we would have chosen.
      const name = texture.getName() || texture.getURI() || `texture-${index}`;
      const isNormal = normalPattern.test(name);
      const isLinear = isNormal || linearPattern.test(name);

      // The encoder picks its image reader by file extension, so a swapped-in PNG sibling
      // (foliage alpha) must not arrive named .jpg.
      const input = join(
        directory,
        `input-${index}${texture.getMimeType() === 'image/png' ? '.png' : '.jpg'}`,
      );
      const output = join(directory, `output-${index}.ktx2`);
      await writeFile(input, image);

      const args = [
        '-ktx2',
        '-mipmap',
        // Normal maps get the encoder's dedicated treatment; every other linear map only needs to
        // skip sRGB metrics. Albedo, which is genuinely sRGB, gets neither flag.
        ...(isNormal ? ['-normal_map', '-mip_renorm'] : isLinear ? ['-linear', '-mip_linear'] : []),
        '-q',
        String(quality),
        '-output_file',
        output,
        input,
      ];
      try {
        await runEncoder(binary, args);
      } catch (error) {
        // A bare "failed reading a source image" from the encoder is nearly impossible to act on;
        // which texture, how big, and what the flags were is what makes it fixable.
        throw new Error(
          `encoding "${name}" (${image.byteLength} bytes, ${texture.getMimeType()}, ` +
            `linear=${isLinear}) failed: ${error.message}`,
          { cause: error },
        );
      }

      const ktx2 = await readFile(output);
      texture.setImage(new Uint8Array(ktx2));
      texture.setMimeType('image/ktx2');
      encoded += 1;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  if (encoded > 0) {
    document.createExtension(KHRTextureBasisu).setRequired(true);
  }
  return { document, textures: encoded };
}
