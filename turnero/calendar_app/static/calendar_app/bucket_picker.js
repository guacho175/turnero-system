(function () {
  function byId(id) { return document.getElementById(id); }

  function setEnabled(selectEl, newInputEl, mode) {
    if (mode !== "create" || !newInputEl) return;
    const isNew = selectEl.value === "__new__";
    newInputEl.disabled = !isNew;
    if (!isNew) newInputEl.value = "";
    const row = newInputEl.closest("[data-bucket-new]");
    if (row) row.classList.toggle("hidden", !isNew);
  }
  function attachRobustToggle(selectEl, newInputEl, mode) {
    if (mode !== "create" || !selectEl || !newInputEl) return;
    const row = newInputEl.closest("[data-bucket-new]");
    const toggle = () => {
      const isNew = selectEl.value === "__new__";
      newInputEl.disabled = !isNew;
      if (row) row.style.display = isNew ? "" : "none";
      if (!isNew) newInputEl.value = "";
    };
    ["change","input","click","keyup","mouseup"].forEach(ev => selectEl.addEventListener(ev, toggle));
    // Observa cambios en el atributo value y en la lista de opciones
    new MutationObserver(toggle).observe(selectEl, { attributes: true, attributeFilter: ["value"] });
    new MutationObserver(toggle).observe(selectEl, { childList: true, subtree: true });
    setInterval(toggle, 150);
    toggle();
  }

  async function _fetchBucketsPrimary() {
    // Google Calendar como fuente de verdad
    try {
      const res = await fetch(`/calendar/buckets/google`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return null;
      const buckets = Array.isArray(data?.buckets) ? data.buckets : [];
      return buckets.length ? buckets : null;
    } catch (_) { return null; }
  }

  async function _fetchBucketsFallback() {
    // Fallback: tabla BD (si Google falla)
    try {
      const res = await fetch(`/calendar/buckets/tabla`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return [];
      return Array.isArray(data?.buckets) ? data.buckets : [];
    } catch (_) { return []; }
  }

  async function loadBuckets(opts) {
    const sel = byId(opts.bucketSelectId);
    const hint = byId(opts.bucketHintId);
    const newInput = opts.mode === "create" ? byId(opts.bucketNewId) : null;

    sel.innerHTML = "";
    hint.textContent = "Cargando buckets…";

    if (opts.mode === "create") {
      const optPlaceholder = document.createElement("option");
      optPlaceholder.value = "";
      optPlaceholder.textContent = "Selecciona un bucket…";
      optPlaceholder.disabled = true;
      optPlaceholder.selected = true;
      sel.appendChild(optPlaceholder);
    }

    let buckets = await _fetchBucketsPrimary();
    if (!buckets || buckets.length === 0) buckets = await _fetchBucketsFallback();
    buckets = [...new Set((buckets || []).map(b => String(b || "").trim()).filter(Boolean))].sort();

    if (opts.includeAllOption) {
      const optAll = document.createElement("option");
      optAll.value = "__all__";
      optAll.textContent = "— (todos / sin bucket)";
      sel.appendChild(optAll);
    }

    buckets.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      sel.appendChild(opt);
    });

    if (opts.mode === "create") {
      const optNew = document.createElement("option");
      optNew.value = "__new__";
      optNew.textContent = "➤ Nuevo…";
      sel.appendChild(optNew);
    }

    hint.textContent = buckets.length
      ? `Buckets: ${buckets.length}`
      : (opts.mode === "create" ? "No hay buckets aún. Usa 'Nuevo…'." : "No hay buckets aún.");

    if (opts.defaultValue) {
      const exists = [...sel.options].some(o => o.value === opts.defaultValue);
      if (exists) sel.value = opts.defaultValue;
    }

    setEnabled(sel, newInput, opts.mode);
    attachRobustToggle(sel, newInput, opts.mode);
    // Fuerza un cambio inmediato para estados iniciales
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getBucketValue(opts) {
    const sel = byId(opts.bucketSelectId);
    const newInput = opts.mode === "create" ? byId(opts.bucketNewId) : null;
    const v = (sel.value || "").trim();
    if (v === "__all__") return "";
    if (v === "__new__") return (newInput.value || "").trim();
    return v;
  }

  function initBucketPicker(opts) {
    opts = Object.assign({
      mode: "filter",
      includeAllOption: true,
      showCounts: true,
      defaultValue: ""
    }, opts);

    const sel = byId(opts.bucketSelectId);

    loadBuckets(opts);

    if (opts.mode === "create") {
      sel.addEventListener("change", () => {
        const newInput = byId(opts.bucketNewId);
        setEnabled(sel, newInput, opts.mode);
      });
    }

    sel.addEventListener("change", () => {
      if (typeof opts.onChange === "function") opts.onChange();
    });

    return { reload: () => loadBuckets(opts), getValue: () => getBucketValue(opts) };
  }

  window.BucketPicker = { initBucketPicker };
})();
