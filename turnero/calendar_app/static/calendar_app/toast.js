(() => {
  "use strict";

  function ensureContainer() {
    let c = document.getElementById("wk-toast-container");
    if (!c) {
      c = document.createElement("div");
      c.id = "wk-toast-container";
      document.body.appendChild(c);
    }
    return c;
  }

  function normalizeType(type) {
    const t = String(type || "info").toLowerCase();
    if (["info", "ok", "warn", "err"].includes(t)) return t;
    if (t === "success") return "ok";
    if (t === "warning") return "warn";
    if (t === "error") return "err";
    return "info";
  }

  function removeToast(el) {
    if (!el || !el.parentNode) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    el.style.transition = "all 180ms ease";
    setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 200);
  }

  /**
   * opts:
   * - type: info|ok|warn|err
   * - title, message
   * - sticky: true => no autoclose (a menos que autoClose=true)
   * - ttl: ms (para autoclose)
   * - autoClose: true/false (default: !sticky)
   * - showProgressBar: true/false (default: false)
   * - progressMode: "determinate"|"indeterminate" (default: determinate)
   */
  function createToast(opts) {
    const o = opts || {};
    const type = normalizeType(o.type);
    const sticky = Boolean(o.sticky);

    const autoClose =
      typeof o.autoClose === "boolean" ? o.autoClose : !sticky;

    const ttl =
      typeof o.ttl === "number" ? o.ttl : 3500;

    const showProgressBar =
      typeof o.showProgressBar === "boolean" ? o.showProgressBar : false;

    const progressMode =
      (o.progressMode === "indeterminate" || o.progressMode === "determinate")
        ? o.progressMode
        : "determinate";

    const el = document.createElement("div");
    el.className = `wk-toast wk-toast--${type}`;

    const body = document.createElement("div");
    const pTitle = document.createElement("p");
    pTitle.className = "wk-toast__title";
    pTitle.textContent = o.title || (type === "ok" ? "Éxito" : type === "err" ? "Error" : "Aviso");

    const pMsg = document.createElement("p");
    pMsg.className = "wk-toast__msg";
    pMsg.textContent = o.message || "";

    body.appendChild(pTitle);
    if (o.message) body.appendChild(pMsg);

    const btn = document.createElement("button");
    btn.className = "wk-toast__close";
    btn.type = "button";
    btn.title = "Cerrar";
    btn.textContent = "×";
    btn.addEventListener("click", () => removeToast(el));

    el.appendChild(body);
    el.appendChild(btn);

    if (showProgressBar) {
      const bar = document.createElement("div");
      bar.className = "wk-toast__bar";
      if (progressMode === "indeterminate") bar.classList.add("indeterminate");

      const fill = document.createElement("div");

      // determinate: usa tu anim actual (decreciente hasta 0)
      if (progressMode === "determinate") {
        fill.style.animationDuration = `${ttl}ms`;
        fill.style.animationIterationCount = "1";
      } else {
        // indeterminate: CSS maneja loop
        fill.style.animationDuration = "";
      }

      bar.appendChild(fill);
      el.appendChild(bar);
    }

    // autoclose solo si autoClose=true
    if (autoClose) {
      setTimeout(() => removeToast(el), ttl);
    }

    // API útil por si quieres cerrar manual desde código
    el.__wkClose = () => removeToast(el);

    return el;
  }

  window.Toast = {
    show: (opts) => {
      const c = ensureContainer();
      const el = createToast(opts);
      c.appendChild(el);
      return el;
    },
    close: (el) => {
      if (el && typeof el.__wkClose === "function") el.__wkClose();
      else removeToast(el);
    },
    clearAll: () => {
      const c = document.getElementById("wk-toast-container");
      if (c) c.innerHTML = "";
    }
  };
})();
