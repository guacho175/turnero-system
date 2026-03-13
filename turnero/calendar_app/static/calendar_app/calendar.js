(() => {
  "use strict";

  const qs = (id) => document.getElementById(id);
  const statusMsg = () => qs("statusMsg");

  // =============================================
  // Estado global para filtrado de profesionales
  // =============================================
  let cachedSlots = [];           // Slots raw del bucket actual
  let currentBucket = "";         // Bucket seleccionado actual
  let currentProfessional = "";   // Profesional seleccionado ("" = todos, "__none__" = sin profesional)

  function parseBucketFromDescription(desc) {
    if (!desc) return null;
    const m = String(desc).match(/(?:^|\n)\s*bucket\s*[:=]\s*(.+?)\s*(?:\n|$)/i);
    return m ? m[1].trim() : null;
  }

  function hashStringToInt(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function bucketColor(bucket) {
    const palette = [
      "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a",
      "#0ea5e9", "#9333ea", "#f59e0b", "#14b8a6", "#ef4444",
    ];
    const key = (bucket || "sin-bucket").toLowerCase();
    return palette[hashStringToInt(key) % palette.length];
  }

  function isoToYmd(iso) { return String(iso).slice(0, 10); }

  function ymdMinusOne(ymd) {
    const [y, m, d] = ymd.split("-").map(n => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  async function fetchBucketsList() {
    // Google Calendar como fuente de verdad
    try {
      const res = await fetch("/calendar/buckets/google", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.buckets) && data.buckets.length) return data.buckets;
    } catch (_) {}
    // fallback: tabla BD (si Google falla)
    try {
      const res = await fetch("/calendar/buckets/tabla", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.buckets)) return data.buckets;
    } catch (_) {}
    return [];
  }

  function buildSlotsUrl(bucket, desdeYmd, hastaYmd) {
    const url = new URL(window.location.origin + `/calendar/buckets/${encodeURIComponent(bucket)}/slots/libres`);
    url.searchParams.set("desde", desdeYmd);
    url.searchParams.set("hasta", hastaYmd);
    url.searchParams.set("limit", "250");
    // ✅ para calendario: trae DISPONIBLE + RESERVADO
    url.searchParams.set("include_all", "1");
    return url.toString();
  }

  async function fetchSlots(bucket, desdeYmd, hastaYmd) {
    const res = await fetch(buildSlotsUrl(bucket, desdeYmd, hastaYmd), { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "No se pudo cargar slots");
    return Array.isArray(data?.slots) ? data.slots : [];
  }

  // =============================================
  // Funciones para filtro de profesionales
  // =============================================

  /**
   * Extrae profesionales únicos de los slots.
   * Retorna array de {key, name} ordenado por nombre.
   * key = professional_key del backend ("__none__" si no tiene)
   * name = professional_name legible (null si no tiene)
   */
  function extractProfessionals(slots) {
    const map = new Map();
    for (const slot of slots) {
      const key = slot.professional_key || "__none__";
      const name = slot.professional_name || null;
      if (!map.has(key)) {
        map.set(key, name);
      }
    }
    // Convertir a array y ordenar
    const result = [];
    for (const [key, name] of map) {
      result.push({ key, name });
    }
    // Ordenar: primero "Sin profesional", luego alfabético
    result.sort((a, b) => {
      if (a.key === "__none__") return -1;
      if (b.key === "__none__") return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
    return result;
  }

  /**
   * Puebla el dropdown de profesionales.
   * @param {Array} professionals - Array de {key, name}
   */
  function populateProfessionalDropdown(professionals) {
    const sel = qs("professionalSelect");
    const hint = qs("professionalHint");
    
    sel.innerHTML = "";
    
    // Opción "Todos"
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "(Todos)";
    sel.appendChild(optAll);

    // Si hay profesionales, habilitar dropdown
    if (professionals.length > 0) {
      // Si hay más de un profesional O si hay profesional + sin profesional
      const hasProfessionals = professionals.some(p => p.key !== "__none__");
      const hasNone = professionals.some(p => p.key === "__none__");
      
      if (hasProfessionals || (hasNone && professionals.length > 1)) {
        sel.disabled = false;
        
        for (const prof of professionals) {
          const opt = document.createElement("option");
          opt.value = prof.key;
          if (prof.key === "__none__") {
            opt.textContent = "Sin profesional";
          } else {
            opt.textContent = prof.name || prof.key;
          }
          sel.appendChild(opt);
        }
        
        const count = professionals.filter(p => p.key !== "__none__").length;
        hint.textContent = count ? `Profesionales: ${count}` : "—";
      } else {
        sel.disabled = true;
        hint.textContent = "—";
      }
    } else {
      sel.disabled = true;
      hint.textContent = "—";
    }

    // Restaurar selección previa si existe
    if (currentProfessional && [...sel.options].some(o => o.value === currentProfessional)) {
      sel.value = currentProfessional;
    } else {
      sel.value = "";
      currentProfessional = "";
    }
  }

  /**
   * Filtra slots por profesional seleccionado.
   * @param {Array} slots - Slots raw
   * @param {string} professionalKey - "" (todos), "__none__" (sin prof), o key específico
   */
  function filterSlotsByProfessional(slots, professionalKey) {
    if (!professionalKey) return slots; // "" = todos
    return slots.filter(slot => {
      const slotKey = slot.professional_key || "__none__";
      return slotKey === professionalKey;
    });
  }

  function mapSlotsToEvents(slots, bucketFallback) {
    return (slots || []).map((ev) => {
      const start = (ev.start && (ev.start.dateTime || ev.start.date)) || null;
      const end = (ev.end && (ev.end.dateTime || ev.end.date)) || null;

      const title = ev.summary || "SLOT";
      const desc = ev.description || "";
      const bucket = ev.bucket || parseBucketFromDescription(desc) || bucketFallback || null;
      const color = bucketColor(bucket);

      const reserved = /reservado/i.test(title) || String(ev.state || "").toLowerCase() === "reserved";

      return {
        id: ev.id,
        title,
        start,
        end,
        backgroundColor: reserved ? "#e5e7eb" : color,
        borderColor: color,
        textColor: reserved ? "#111827" : "#ffffff",
        classNames: reserved ? ["is-reserved"] : ["is-available"],
        extendedProps: { 
          bucket,
          professional_key: ev.professional_key || "__none__",
          professional_name: ev.professional_name || null
        }
      };
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const buckets = (await fetchBucketsList())
      .map(b => String(b || "").trim())
      .filter(Boolean)
      .sort();

    const el = qs("calendar");
    const profSelect = qs("professionalSelect");
    let calendar = null;

    const picker = BucketPicker.initBucketPicker({
      mode: "filter",
      agendaSelectId: "agendaSelect",   // queda fijo (Calendario BD)
      bucketSelectId: "bucketSelect",
      bucketHintId: "bucketHint",
      includeAllOption: true,
      showCounts: true,
      onChange: () => {
        // Reset profesional al cambiar bucket
        currentProfessional = "";
        if (profSelect) profSelect.value = "";
        if (calendar) calendar.refetchEvents();
      }
    });

    // Listener para cambio de profesional
    if (profSelect) {
      profSelect.addEventListener("change", () => {
        currentProfessional = profSelect.value;
        if (calendar) calendar.refetchEvents();
      });
    }

    calendar = new FullCalendar.Calendar(el, {
      initialView: "dayGridMonth",
      locale: "es",
      firstDay: 1,
      buttonText: { today: "hoy", month: "mes", week: "semana", day: "día" },

      height: "auto",
      expandRows: false,
      fixedWeekCount: false,
      
      // Limitar eventos visibles por día (evita solapamiento)
      dayMaxEvents: 3,
      dayMaxEventRows: 3,
      
      // Mostrar eventos como bloques
      eventDisplay: "block",

      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay"
      },

      events: async (info, successCallback, failureCallback) => {
        try {
          if (!buckets.length) {
            statusMsg().textContent = "";
            populateProfessionalDropdown([]);
            successCallback([]);
            return;
          }

          const desde = isoToYmd(info.startStr);
          const hastaExclusive = isoToYmd(info.endStr);
          const hasta = ymdMinusOne(hastaExclusive);

          const bucketValue = picker.getValue(); // "" => todos

          let allSlots = [];

          if (bucketValue) {
            // Un bucket específico
            allSlots = await fetchSlots(bucketValue, desde, hasta);
            currentBucket = bucketValue;
          } else {
            // Todos los buckets
            const results = await Promise.allSettled(buckets.map(b => fetchSlots(b, desde, hasta)));
            results.forEach((r) => {
              if (r.status === "fulfilled") {
                allSlots = allSlots.concat(r.value);
              }
            });
            currentBucket = "";
          }

          // Guardar slots raw para filtrado
          cachedSlots = allSlots;

          // Poblar dropdown de profesionales
          const professionals = extractProfessionals(allSlots);
          populateProfessionalDropdown(professionals);

          // Filtrar por profesional si hay uno seleccionado
          const filteredSlots = filterSlotsByProfessional(allSlots, currentProfessional);
          const allEvents = mapSlotsToEvents(filteredSlots, bucketValue || null);

          // Status message
          const profName = currentProfessional 
            ? (currentProfessional === "__none__" ? "Sin profesional" : profSelect.options[profSelect.selectedIndex]?.textContent || currentProfessional)
            : "";
          const bucketLabel = bucketValue || "Todos los buckets";
          const profLabel = profName ? ` · Prof: ${profName}` : "";
          statusMsg().textContent = `${bucketLabel}${profLabel} · Slots: ${allEvents.length}`;

          successCallback(allEvents);
        } catch (e) {
          console.error(e);
          statusMsg().textContent = "Error cargando slots.";
          failureCallback(e);
        }
      }
    });

    calendar.render();
  });
})();
