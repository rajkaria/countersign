export type Fetcher = typeof fetch;
export async function boundedJson(
  response: Response,
  maxBytes = 1_000_000,
): Promise<unknown> {
  if (!response.ok)
    throw new Error(`Remote service returned ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Response exceeds size limit");
  if (!response.body) throw new Error("Empty remote response");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Response exceeds size limit");
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      all.set(part, offset);
      offset += part.length;
    }
    return JSON.parse(new TextDecoder().decode(all));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
