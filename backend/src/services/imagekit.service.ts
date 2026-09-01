import { ImageKit } from "@imagekit/nodejs";

/**
 * imagekit.service.ts
 *
 * Handles all ImageKit file upload operations.
 * Uses the official @imagekit/nodejs SDK.
 *
 * Credentials are read exclusively from process.env — never hardcoded.
 */

// Lazily create the client so missing env vars don't crash the server at startup
let _client: ImageKit | null = null;

const getClient = (): ImageKit => {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      "IMAGEKIT_PRIVATE_KEY is not set in .env. ImageKit upload is unavailable."
    );
  }

  if (!_client) {
    _client = new ImageKit({ privateKey });
  }

  return _client;
};

/**
 * Upload a base64 data-URL image to ImageKit and return its public HTTPS URL.
 *
 * @param base64DataUrl  Full data-URL string, e.g. "data:image/png;base64,ABC..."
 * @param filename       Desired filename, e.g. "poster_42_1234567890.png"
 * @param folder         Optional target folder on ImageKit (default: /real-estate-posters)
 * @returns              The public HTTPS URL of the uploaded image
 * @throws               Error with a descriptive message on any failure
 */
export const uploadBase64Image = async (
  base64DataUrl: string,
  filename: string,
  folder = "/real-estate-posters"
): Promise<string> => {
  if (!base64DataUrl || !base64DataUrl.startsWith("data:")) {
    throw new Error(
      "Invalid image data: expected a base64 data-URL starting with 'data:image/...'."
    );
  }

  const client = getClient();

  console.log(`[ImageKit] Uploading '${filename}' to folder '${folder}'...`);

  // @imagekit/nodejs accepts the full data-URL directly as the 'file' parameter
  const response = await client.files.upload({
    file: base64DataUrl,
    fileName: filename,
    folder,
    useUniqueFileName: false,
  } as any);

  const publicUrl = (response as any).url as string | undefined;

  if (!publicUrl) {
    throw new Error(
      "ImageKit upload call succeeded but the response did not contain a public URL."
    );
  }

  console.log(`[ImageKit] Upload complete: ${publicUrl}`);
  return publicUrl;
};

/**
 * Download a remote image URL and upload it to ImageKit.
 * This bypasses CORS and permission issues on third-party CDNs (like Instagram).
 */
export const uploadRemoteImageToImageKit = async (
  remoteUrl: string,
  filename: string,
  folder = "/real-estate-posters"
): Promise<string> => {
  if (!remoteUrl) {
    throw new Error("Invalid remote URL provided.");
  }

  const client = getClient();

  try {
    console.log(`[ImageKit] Direct uploading remote URL: ${remoteUrl}`);
    const response = await client.files.upload({
      file: remoteUrl,
      fileName: filename,
      folder,
      useUniqueFileName: false,
    } as any);

    const publicUrl = (response as any).url as string | undefined;
    if (!publicUrl) {
      throw new Error("ImageKit upload succeeded but returned no public URL.");
    }
    console.log(`[ImageKit] Remote upload complete: ${publicUrl}`);
    return publicUrl;
  } catch (error: any) {
    console.warn(`[ImageKit] Direct URL upload failed (${error.message}), attempting buffer fallback...`);
    try {
      const res = await fetch(remoteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch image from CDN: ${res.statusText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const base64DataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;

      return await uploadBase64Image(base64DataUrl, filename, folder);
    } catch (fallbackError: any) {
      console.error(`[ImageKit] Failed to upload remote image ${remoteUrl}:`, fallbackError.message);
      throw fallbackError;
    }
  }
};
