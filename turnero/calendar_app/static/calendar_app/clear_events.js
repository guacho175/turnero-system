/* clear_events.js
   + Gestiona dos modos: limpiar todo vs limpiar por bucket
   + UI: usa Toast (toast.js)
   + Evita doble envío con flags y deshabilita botones
*/

let isSubmitting = false;
let progressToastEl = null;

/*
 ============================================================================
 CLEAR_EVENTS.JS - Sistema de limpieza de calendarios Google
 ============================================================================
 
 QUÉ HACE:
   - Panel con 3 modos:
     1) Limpiar TODO el calendario
     2) Limpiar solo eventos de UN bucket
     3) Sincronizar tabla BD con Google (elimina buckets fantasma)
   
   - Usa Toast (notificaciones flotantes) para feedback
   - Evita doble envío (flag isSubmitting + botones deshabilitados)
   - Muestra JSON de respuesta para debug
 
 FUNCIONES PRINCIPALES:
   - setupTabs() → Cambia entre tabs
   - handleClearAll() → Limpia todo el calendario
   - handleClearBucket() → Limpia solo un bucket
   - handleSync() → Sincroniza tabla con Google
   - toast() → Muestra notificaciones flotantes
 
 ============================================================================
*/

function toast(type, text, opts = {}) {
  const map = { 
    info: "info", 
    success: "ok", 
    ok: "ok", 
    warning: "warn", 
    warn: "warn", 
    danger: "err", 
    error: "err", 
    err: "err" 
  };
  const t = map[String(type || "info").toLowerCase()] || "info";
  const sticky = Boolean(opts.sticky);
  const ttl = typeof opts.ttl === "number" ? opts.ttl : 3500;
  const autoClose = typeof opts.autoClose === "boolean" ? opts.autoClose : undefined;
  const showProgressBar = typeof opts.showProgressBar === "boolean" ? opts.showProgressBar : undefined;
  const progressMode = (opts.progressMode === "indeterminate" || opts.progressMode === "determinate") ? opts.progressMode : undefined;

  if (window.Toast && typeof window.Toast.show === "function") {
    return window.Toast.show({
      type: t,
      title: opts.title || (t === "ok" ? "Éxito" : t === "err" ? "Error" : "Aviso"),
      message: text || "",
      sticky,
      ttl,
      autoClose,
      showProgressBar,
      progressMode,
    });
  }
  if (t === "err") alert(`Error: ${text}`);
  else alert(text);
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
    if (btn) btn.click();
    else progressToastEl.remove();
  }
  progressToastEl = null;
}

function setOutput(data) {
  const el = document.getElementById("out");
  if (el) {
    try {
      el.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      el.textContent = String(data);
    }
  }
}

// =====================================================
// TAB SWITCHING
// =====================================================

// =====================================================
// SISTEMA DE TABS
// =====================================================

function setupTabs() {
  // QUÉ HACE: Permite cambiar entre los 3 modos
  //   - Limpiar todo
  //   - Limpiar por bucket
  //   - Sincronizar tabla
  
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");

      // Desactiva TODOS los tabs
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      // Activa solo el seleccionado
      btn.classList.add("active");
      const target = document.getElementById(tabName);
      if (target) target.classList.add("active");
    });
  });
}

// =====================================================
// MODO 1: LIMPIAR TODO
// =====================================================

// =====================================================
// MODO 1: LIMPIAR TODO EL CALENDARIO
// =====================================================

async function handleClearAll() {
  // QUÉ HACE:
  //   1) Valida que hayas ingresado un calendar_id
  //   2) Si especificas fechas, las valida
  //   3) Llama POST /calendar/calendars/limpiar
  //   4) Muestra Toast con progreso indeterminado
  //   5) Devuelve JSON con eventos eliminados
  //
  // FLUJO:
  //   Sin fechas → borra TODO el calendario
  //   Con fechas → borra solo ese rango
  //
  // AFTER: Llama /calendar/buckets/sincronizar para actualizar tabla
  
  if (isSubmitting) return;  // Evita doble click

  const calId = (document.getElementById("cal_id_all").value || "").trim();
  if (!calId) {
    toast("warning", "Por favor ingresa un ID de calendario.");
    return;
  }

  const rangeStart = document.getElementById("range_start_all").value || null;
  const rangeEnd = document.getElementById("range_end_all").value || null;

  if (rangeStart && rangeEnd && rangeEnd < rangeStart) {
    toast("warning", "La fecha 'Hasta' debe ser posterior a 'Desde'.");
    return;
  }

  // Marca como en progreso
  isSubmitting = true;
  const btnClearAll = document.getElementById("btnClearAll");
  const btnClearAllReset = document.getElementById("btnClearAllReset");
  btnClearAll.disabled = true;
  btnClearAllReset.disabled = true;

  // Muestra Toast con spinner indeterminado
  progressToastEl = toast("info", "Eliminando eventos...", {
    sticky: true,
    showProgressBar: true,
    progressMode: "indeterminate",
  });

  try {
    // Arma payload según fechas
    const payload = { calendar_id: calId };
    if (rangeStart) payload.range_start_date = rangeStart;
    if (rangeEnd) payload.range_end_date = rangeEnd;

    // Llama API
    const res = await fetch("/calendar/calendars/limpiar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    closeProgressToast();

    const data = await res.json();
    setOutput(data);  // Muestra JSON en debug

    if (!res.ok) {
      const msg = data.detail || `Error ${res.status}`;
      toast("error", msg);
    } else {
      const count = data.deleted_count || 0;
      toast("success", `✓ Se eliminaron ${count} eventos.`, { sticky: true });
    }
  } catch (err) {
    closeProgressToast();
    toast("error", `Excepción: ${err.message}`);
    setOutput({ error: err.message });
  } finally {
    isSubmitting = false;
    btnClearAll.disabled = false;
    btnClearAllReset.disabled = false;
  }
}

function handleClearAllReset() {
  document.getElementById("cal_id_all").value = "";
  document.getElementById("range_start_all").value = "";
  document.getElementById("range_end_all").value = "";
  document.getElementById("out").textContent = "—";
}

// =====================================================
// MODO 2: LIMPIAR POR BUCKET
// =====================================================

// =====================================================
// MODO 2: LIMPIAR POR BUCKET
// =====================================================

async function handleClearBucket() {
  // QUÉ HACE:
  //   1) Valida calendar_id y bucket
  //   2) Normaliza bucket a minúsculas
  //   3) Llama POST /calendar/calendars/limpiar-bucket
  //   4) Borra SOLO eventos con ese bucket
  //   5) No toca otros buckets
  //
  // CASO:
  //   Tenías "medico" y "peluqueria" → Borras solo medico
  //   → Peluqueria sigue intacta
  //
  // AFTER: Llama /calendar/buckets/sincronizar
  
  if (isSubmitting) return;

  const calId = (document.getElementById("cal_id_bucket").value || "").trim();
  const bucket = (document.getElementById("bucket_name").value || "").trim().toLowerCase();

  if (!calId) {
    toast("warning", "Por favor ingresa un ID de calendario.");
    return;
  }

  if (!bucket) {
    toast("warning", "Por favor ingresa un nombre de bucket.");
    return;
  }

  const rangeStart = document.getElementById("range_start_bucket").value || null;
  const rangeEnd = document.getElementById("range_end_bucket").value || null;

  if (rangeStart && rangeEnd && rangeEnd < rangeStart) {
    toast("warning", "La fecha 'Hasta' debe ser posterior a 'Desde'.");
    return;
  }

  isSubmitting = true;
  const btnClearBucket = document.getElementById("btnClearBucket");
  const btnClearBucketReset = document.getElementById("btnClearBucketReset");
  btnClearBucket.disabled = true;
  btnClearBucketReset.disabled = true;

  progressToastEl = toast("info", "Eliminando eventos del bucket...", {
    sticky: true,
    showProgressBar: true,
    progressMode: "indeterminate",
  });

  try {
    // Arma payload con bucket normalizado
    const payload = { 
      calendar_id: calId, 
      bucket: bucket  // Backend lo normaliza de nuevo (tolerante)
    };
    if (rangeStart) payload.range_start_date = rangeStart;
    if (rangeEnd) payload.range_end_date = rangeEnd;

    // Llama API de limpiar por bucket
    const res = await fetch("/calendar/calendars/limpiar-bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    closeProgressToast();

    const data = await res.json();
    setOutput(data);

    if (!res.ok) {
      const msg = data.detail || `Error ${res.status}`;
      toast("error", msg);
    } else {
      const count = data.deleted_count || 0;
      toast("success", `✓ Se eliminaron ${count} eventos del bucket "${bucket}".`, { sticky: true });
    }
  } catch (err) {
    closeProgressToast();
    toast("error", `Excepción: ${err.message}`);
    setOutput({ error: err.message });
  } finally {
    isSubmitting = false;
    btnClearBucket.disabled = false;
    btnClearBucketReset.disabled = false;
  }
}

function handleClearBucketReset() {
  document.getElementById("cal_id_bucket").value = "";
  document.getElementById("bucket_name").value = "";
  document.getElementById("range_start_bucket").value = "";
  document.getElementById("range_end_bucket").value = "";
  document.getElementById("out").textContent = "—";
}

// =====================================================
// MODO 3: SINCRONIZAR TABLA
// =====================================================

// =====================================================
// MODO 3: SINCRONIZAR TABLA CON GOOGLE
// =====================================================

async function handleSync() {
  // QUÉ HACE:
  //   1) Lee TODOS los buckets de Google Calendar BD
  //   2) Elimina registros de tabla (Bucket) que ya no existen en Google
  //   3) Sincroniza tabla con realidad de Google
  //
  // PROBLEMA QUE SOLUCIONA:
  //   Borras eventos "medico" en Google
  //   → Tabla Bucket sigue teniendo registro "medico"
  //   → UI muestra bucket fantasma
  //   
  //   SOLUTION: Llamas handleSync()
  //   → Tabla se actualiza automáticamente
  //   → UI carga buckets correctos después
  //
  // RECOMENDACIÓN:
  //   Después de limpiar con handleClearAll() o handleClearBucket()
  //   → Llama esto para actualizar tabla
  //   → Luego recarga /calendar/ui/slots para ver cambios
  
  if (isSubmitting) return;

  isSubmitting = true;
  const btnSync = document.getElementById("btnSync");
  btnSync.disabled = true;

  progressToastEl = toast("info", "Sincronizando tabla con Google...", {
    sticky: true,
    showProgressBar: true,
    progressMode: "indeterminate",
  });

  try {
    // Llama API (no requiere parámetros)
    const res = await fetch("/calendar/buckets/sincronizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),  // Body vacío
    });

    closeProgressToast();

    const data = await res.json();
    setOutput(data);

    if (!res.ok) {
      const msg = data.detail || `Error ${res.status}`;
      toast("error", msg);
    } else {
      const deleted = data.deleted_count || 0;
      // Mensaje inteligente según si borró algo o no
      const msg = deleted > 0 
        ? `✓ Sincronizado. Se eliminaron ${deleted} bucket(s) fantasma.`
        : `✓ Sincronizado. Tabla ya estaba actualizada.`;
      toast("success", msg, { sticky: true });
    }
  } catch (err) {
    closeProgressToast();
    toast("error", `Excepción: ${err.message}`);
    setOutput({ error: err.message });
  } finally {
    isSubmitting = false;
    btnSync.disabled = false;
  }
}

// =====================================================
// INIT
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();

  // Botones modo 1
  const btnClearAll = document.getElementById("btnClearAll");
  const btnClearAllReset = document.getElementById("btnClearAllReset");
  if (btnClearAll) btnClearAll.addEventListener("click", handleClearAll);
  if (btnClearAllReset) btnClearAllReset.addEventListener("click", handleClearAllReset);

  // Botones modo 2
  const btnClearBucket = document.getElementById("btnClearBucket");
  const btnClearBucketReset = document.getElementById("btnClearBucketReset");
  if (btnClearBucket) btnClearBucket.addEventListener("click", handleClearBucket);
  if (btnClearBucketReset) btnClearBucketReset.addEventListener("click", handleClearBucketReset);

  // Botón modo 3
  const btnSync = document.getElementById("btnSync");
  if (btnSync) btnSync.addEventListener("click", handleSync);
});
