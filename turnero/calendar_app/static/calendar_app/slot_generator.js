// slot_generator.js (orquestador)
// Lee el DOM, coordina payload + API, mantiene UX (toasts, anti doble envío).

import {
  addWindowEntry,
  addBlockEntry,
  deleteWindowEntry,
  deleteBlockEntry,
  clearWindowsBlocks,
  buildGenerateSlotsPayload,
  getSelectedBucket,
  validatePayload,
  getWindows,
  getBlocks,
} from "./slot_payload.js";
import { postGenerateSlots } from "./slot_api.js";

const TOAST_TITLE = {
  ok: "Éxito",
  err: "Error",
  info: "Info",
  warn: "Aviso",
};

let isSubmitting = false;
let progressToastEl = null;
let picker = null;

function toast(type, text, opts = {}) {
  const map = { info: "info", success: "ok", ok: "ok", warning: "warn", warn: "warn", danger: "err", error: "err", err: "err" };
  const t = map[String(type || "info").toLowerCase()] || "info";
  const sticky = Boolean(opts.sticky);
  const ttl = typeof opts.ttl === "number" ? opts.ttl : 3500;
  const autoClose = typeof opts.autoClose === "boolean" ? opts.autoClose : undefined;
  const showProgressBar = typeof opts.showProgressBar === "boolean" ? opts.showProgressBar : undefined;
  const progressMode = (opts.progressMode === "indeterminate" || opts.progressMode === "determinate") ? opts.progressMode : undefined;

  if (window.Toast && typeof window.Toast.show === "function") {
    return window.Toast.show({
      type: t,
      title: opts.title || TOAST_TITLE[t] || TOAST_TITLE.info,
      message: text || "",
      sticky,
      ttl,
      autoClose,
      showProgressBar,
      progressMode,
    });
  }
  if (t === "err") alert(`Error: ${text}`); else alert(text);
  return null;
}

function closeProgressToast() {
  if (!progressToastEl) return;
  if (window.Toast && typeof window.Toast.close === "function") {
    window.Toast.close(progressToastEl);
    progressToastEl = null;
    return;
  }
  if (progressToastEl && progressToastEl.isConnected) {
    const btn = progressToastEl.querySelector(".wk-toast__close");
    if (btn) btn.click(); else progressToastEl.remove();
  }
  progressToastEl = null;
}

function normalizeTime(str) {
  if (!str) return "";
  const raw = String(str).trim();
  const parts = raw.split(":");
  let h = parts[0] || "";
  let m = parts[1] || "00";
  if (h.length === 1) h = "0" + h;
  if (m.length === 1) m = "0" + m;
  return `${h}:${m}`;
}

function renderTables() {
  const windows = getWindows();
  const blocks = getBlocks();

  const wBody = document.querySelector("#windows_table tbody");
  if (wBody) {
    wBody.innerHTML = "";
    windows.forEach((w, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${w.start}</td>
        <td>${w.end}</td>
        <td><button type="button" class="btn-danger" data-del-window="${idx}">X</button></td>
      `;
      wBody.appendChild(tr);
    });
    wBody.querySelectorAll("[data-del-window]").forEach((btn) => btn.addEventListener("click", () => {
      deleteWindowEntry(Number(btn.getAttribute("data-del-window")));
      renderTables();
    }));
  }

  const bBody = document.querySelector("#blocks_table tbody");
  if (bBody) {
    bBody.innerHTML = "";
    blocks.forEach((b, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${b.start}</td>
        <td>${b.end}</td>
        <td><button type="button" class="btn-danger" data-del-block="${idx}">X</button></td>
      `;
      bBody.appendChild(tr);
    });
    bBody.querySelectorAll("[data-del-block]").forEach((btn) => btn.addEventListener("click", () => {
      deleteBlockEntry(Number(btn.getAttribute("data-del-block")));
      renderTables();
    }));
  }
}

function addWindow() {
  const s = normalizeTime(document.getElementById("win_start")?.value);
  const e = normalizeTime(document.getElementById("win_end")?.value);
  const res = addWindowEntry(s, e);
  if (!res.ok) {
    toast("warn", res.message, { title: "Dato faltante", sticky: true, autoClose: false });
    return;
  }
  renderTables();
  toast("ok", `Ventana: ${s}–${e}`, { title: "Ventana agregada", sticky: false });
}

function addBlock() {
  const s = normalizeTime(document.getElementById("blk_start")?.value);
  const e = normalizeTime(document.getElementById("blk_end")?.value);
  const res = addBlockEntry(s, e);
  if (!res.ok) {
    toast("warn", res.message, { title: "Dato faltante", sticky: true, autoClose: false });
    return;
  }
  renderTables();
  toast("ok", `Bloqueo: ${s}–${e}`, { title: "Bloqueo agregado", sticky: false });
}

function clearTables() {
  clearWindowsBlocks();
  renderTables();
  toast("info", "Ventanas y bloqueos limpiados.", { title: "Listo", sticky: false });
}

function ensureDefaultWindow() {
  if (getWindows().length === 0) {
    addWindowEntry("09:00", "18:00");
  }
}

async function crear() {
  if (isSubmitting) {
    toast("info", "Ya hay una solicitud en proceso…", { title: "En proceso", sticky: true, autoClose: false, showProgressBar: true, progressMode: "indeterminate" });
    return;
  }

  const btn = document.getElementById("btnCreate");
  const oldText = btn ? btn.textContent : "";

  const bucketSelectVal = document.getElementById("bucketSelect")?.value;
  const bucket = (getSelectedBucket() || "").trim();

  if (bucketSelectVal === "__new__" && !bucket) {
    const outEl = document.getElementById("out");
    if (outEl) outEl.textContent = "⚠️ Escribe el nombre del nuevo bucket.";
    toast("warn", "Escribe el nombre del nuevo bucket.", { title: "Falta bucket", sticky: true, autoClose: false });
    return;
  }
  if (!bucket && bucketSelectVal !== "__new__") {
    const outEl = document.getElementById("out");
    if (outEl) outEl.textContent = "⚠️ Selecciona un bucket.";
    toast("warn", "Selecciona un bucket.", { title: "Falta bucket", sticky: true, autoClose: false });
    return;
  }

  ensureDefaultWindow();
  renderTables();

  const payload = buildGenerateSlotsPayload();
  const validation = validatePayload(payload);
  if (!validation.ok) {
    toast("warn", validation.message || "Payload inválido.", { title: "Validación", sticky: true, autoClose: false });
    return;
  }

  const ok = confirm(`¿Confirmas crear slots?\n\nBucket: ${bucket}\nRango: ${payload.range_start_date} → ${payload.range_end_date}\nDuración: ${payload.slot_minutes} min`);
  if (!ok) {
    toast("info", "Operación cancelada.", { title: "Cancelado", sticky: false });
    return;
  }

  isSubmitting = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Creando…";
  }

  progressToastEl = toast("info", "Enviando solicitud…", { title: "En proceso", sticky: true, autoClose: false, showProgressBar: true, progressMode: "indeterminate" });

  let data;
  try {
    data = await postGenerateSlots(bucket, payload);
  } catch (e) {
    const outEl = document.getElementById("out");
    if (outEl) outEl.textContent = String(e?.message || e);
    closeProgressToast();
    toast("err", e?.message || "No se pudo crear slots.", { title: "Error", sticky: true, autoClose: false });
    return;
  } finally {
    isSubmitting = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
  const outEl = document.getElementById("out");
  if (outEl) outEl.textContent = JSON.stringify(data, null, 2);
  closeProgressToast();

  const n = Number(data?.created_count ?? 0);
  if (n > 0) {
    toast("ok", `Slots creados ✅ (${n})`, { title: "Éxito", sticky: true, autoClose: false });
  } else {
    const reason = (data && (data.reason || data.detail || data.message)) ? (data.reason || data.detail || data.message) : null;
    const msg = reason ? `No se crearon slots (0). Motivo: ${reason}` : "No se crearon slots (0). Puede que no haya espacio, ya existan slots en esos horarios, o los bloqueos/ventanas lo impidan.";
    toast("warn", msg, { title: "Sin cambios", sticky: true, autoClose: false });
  }

  if (bucketSelectVal === "__new__" && picker) picker.reload();
}

function initBucketPicker() {
  picker = BucketPicker.initBucketPicker({
    mode: "create",
    agendaSelectId: null,
    bucketSelectId: "bucketSelect",
    bucketNewId: "bucketNew",
    bucketHintId: "bucketHint",
    includeAllOption: false,
    showCounts: true,
  });

  const sel = document.getElementById("bucketSelect");
  const newInput = document.getElementById("bucketNew");
  const newRow = newInput ? newInput.closest("[data-bucket-new]") : null;
  const toggleNew = () => {
    const isNew = sel && sel.value === "__new__";
    if (newInput) newInput.disabled = !isNew;
    if (newRow) newRow.classList.toggle("hidden", !isNew);
    if (!isNew && newInput) newInput.value = "";
  };
  if (sel) {
    ["change","input","click","keyup","mouseup"].forEach(ev => sel.addEventListener(ev, toggleNew));
    new MutationObserver(toggleNew).observe(sel, { attributes: true, attributeFilter: ["value"] });
    new MutationObserver(toggleNew).observe(sel, { childList: true, subtree: true });
    setInterval(toggleNew, 150);
    setInterval(() => {
      const opt = sel.options[sel.selectedIndex];
      if (!opt) return;
      if (opt.value === "__new__" || /nuevo/i.test(opt.textContent || "")) {
        sel.value = "__new__";
      }
      toggleNew();
    }, 300);
    toggleNew();
  }
}

function setDefaultDates() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const d1 = new Date(now);
  const d2 = new Date(now); d2.setDate(d2.getDate() + 7);
  const startEl = document.getElementById("range_start_date");
  const endEl = document.getElementById("range_end_date");
  if (startEl) startEl.value = toDateInput(d1);
  if (endEl) endEl.value = toDateInput(d2);
}

document.addEventListener("DOMContentLoaded", () => {
  initBucketPicker();
  setDefaultDates();

  document.getElementById("btnAddWindow")?.addEventListener("click", addWindow);
  document.getElementById("btnAddBlock")?.addEventListener("click", addBlock);
  document.getElementById("btnCreate")?.addEventListener("click", crear);
  document.getElementById("btnClear")?.addEventListener("click", clearTables);

  renderTables();
});
