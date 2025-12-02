// Utilities for encoding and decoding state to/from URL

const roundCoord = (value) => Math.round(value * 100) / 100;

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecodeToBytes(encoded) {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Decode state from ?state= query param (gzipped+base64url JSON)
export async function decodeStateFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("state");
    if (!encoded) return null;

    const bytes = base64UrlDecodeToBytes(encoded);
    let json;

    if (window.DecompressionStream) {
      try {
        const ds = new DecompressionStream("gzip");
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        json = new TextDecoder().decode(decompressed);
      } catch (err) {
        // Not gzipped or failed to decompress → treat as plain UTF-8 JSON
        json = new TextDecoder().decode(bytes);
      }
    } else {
      json = new TextDecoder().decode(bytes);
    }

    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch (err) {
    console.warn("Failed to decode state from URL", err);
    return null;
  }
}

// Encode state array to compressed base64url string
export async function encodeStateToUrl(stateArray) {
  const json = JSON.stringify(stateArray);
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(json);
  let bytes = inputBytes;

  if (window.CompressionStream) {
    try {
      const cs = new CompressionStream("gzip");
      const writer = cs.writable.getWriter();
      writer.write(inputBytes);
      writer.close();
      const compressed = await new Response(cs.readable).arrayBuffer();
      bytes = new Uint8Array(compressed);
    } catch (err) {
      // Fall back to uncompressed
      bytes = inputBytes;
    }
  }

  return base64UrlEncode(bytes);
}

// Round coordinates for consistent precision in state
export { roundCoord };

