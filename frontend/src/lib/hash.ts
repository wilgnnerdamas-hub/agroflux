/** SHA-256 em hex minúsculo sobre os bytes crus do arquivo (§2 do contrato). */
export async function sha256File(file: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Este navegador não permite calcular o hash aqui. Use HTTPS ou localhost.");
  }
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
