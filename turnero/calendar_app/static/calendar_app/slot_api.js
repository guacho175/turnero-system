// slot_api.js
// Encapsula las llamadas HTTP al backend. No conoce el DOM.

export async function postGenerateSlots(bucket, payload) {
  const bucketNorm = (bucket || "").trim();
  if (!bucketNorm) {
    throw new Error("Bucket vacío");
  }

  const url = `/calendar/buckets/${encodeURIComponent(bucketNorm)}/slots/generar`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_e) {
    // si no hay JSON, data queda null
  }

  if (!res.ok) {
    const detail = (data && (data.detail || data.error || data.message)) || `Error ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
