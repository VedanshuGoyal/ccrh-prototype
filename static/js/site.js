/* CCRH website prototype: progressive enhancement only.
   Every page is complete HTML without JavaScript; scripts add filters, search and display preferences. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };

  /* ---------- Display preferences: text size and contrast ---------- */
  var SCALES = [0.875, 1, 1.125, 1.25, 1.375];
  function currentScale() { var s = parseFloat(store.get("ccrh-scale")); return SCALES.indexOf(s) >= 0 ? s : 1; }
  function applyScale(s) { doc.style.setProperty("--scale", s); store.set("ccrh-scale", String(s)); }
  document.querySelectorAll("[data-text-size]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dir = btn.getAttribute("data-text-size");
      var i = SCALES.indexOf(currentScale());
      if (dir === "up") i = Math.min(i + 1, SCALES.length - 1);
      else if (dir === "down") i = Math.max(i - 1, 0);
      else i = 1;
      applyScale(SCALES[i]);
    });
  });
  var contrastBtns = Array.prototype.slice.call(document.querySelectorAll("[data-contrast-set]"));
  function syncContrast() {
    var high = doc.getAttribute("data-contrast") === "high";
    contrastBtns.forEach(function (b) { b.setAttribute("aria-pressed", (b.getAttribute("data-contrast-set") === "high") === high ? "true" : "false"); });
  }
  contrastBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var high = b.getAttribute("data-contrast-set") === "high";
      if (high) doc.setAttribute("data-contrast", "high"); else doc.removeAttribute("data-contrast");
      store.set("ccrh-contrast", high ? "high" : "normal");
      syncContrast();
    });
  });
  syncContrast();

  /* ---------- Accessibility menu in the top bar ---------- */
  var a11yBtn = document.querySelector("[data-a11y-toggle]");
  var a11yPanel = document.getElementById("a11y-panel");
  function setA11y(open) {
    if (!a11yBtn) return;
    a11yBtn.setAttribute("aria-expanded", open ? "true" : "false");
    a11yPanel.classList.toggle("is-open", open);
  }
  if (a11yBtn) a11yBtn.addEventListener("click", function () { setA11y(a11yBtn.getAttribute("aria-expanded") !== "true"); });

  /* ---------- Main menu: dropdowns open on hover, click or keyboard ---------- */
  var navBtns = Array.prototype.slice.call(document.querySelectorAll(".mainnav__btn"));
  function closeAll(except) {
    navBtns.forEach(function (b) {
      if (b === except) return;
      b.setAttribute("aria-expanded", "false");
      b.parentElement.classList.remove("is-open");
    });
  }
  navBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      closeAll(btn);
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      btn.parentElement.classList.toggle("is-open", !open);
    });
  });
  // Keep a dropdown open while focus is inside it (keyboard users tabbing through links)
  document.querySelectorAll(".dropdown").forEach(function (dd) {
    dd.addEventListener("focusin", function () {
      var btn = dd.parentElement.querySelector(".mainnav__btn");
      closeAll(btn);
      btn.setAttribute("aria-expanded", "true");
      dd.parentElement.classList.add("is-open");
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var openBtn = navBtns.filter(function (b) { return b.getAttribute("aria-expanded") === "true"; })[0];
    closeAll(null);
    if (openBtn) openBtn.focus();
    if (a11yBtn && a11yBtn.getAttribute("aria-expanded") === "true") { setA11y(false); a11yBtn.focus(); }
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".mainnav")) closeAll(null);
    if (a11yBtn && !e.target.closest(".topbar__tools")) setA11y(false);
  });
  document.addEventListener("focusin", function (e) {
    if (!e.target.closest(".mainnav")) closeAll(null);
  });

  var menuToggle = document.querySelector(".menu-toggle");
  var mainnav = document.getElementById("mainnav");
  if (menuToggle && mainnav) {
    menuToggle.addEventListener("click", function () {
      var open = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", open ? "false" : "true");
      mainnav.classList.toggle("is-open", !open);
    });
  }

  /* ---------- Announcement ticker: pausable (WCAG 2.2.2) ---------- */
  document.querySelectorAll(".ticker").forEach(function (t) {
    var btn = t.querySelector(".ticker__btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var paused = t.classList.toggle("is-paused");
      btn.setAttribute("aria-pressed", paused ? "true" : "false");
      btn.querySelector("[data-label]").textContent = paused ? btn.getAttribute("data-play") : btn.getAttribute("data-pause");
      btn.querySelector(".i-pause").style.display = paused ? "none" : "";
      btn.querySelector(".i-play").style.display = paused ? "" : "none";
    });
  });

  /* ---------- Back to top ---------- */
  var btt = document.querySelector(".backtotop");
  if (btt) {
    window.addEventListener("scroll", function () { btt.classList.toggle("is-visible", window.scrollY > 600); }, { passive: true });
  }

  /* ---------- Filterable lists (tenders, vacancies, centres, publications) ---------- */
  var DAY = 86400000;
  function statusFromClosing(iso, now) {
    if (!iso) return "archive";
    var t = Date.parse(iso);
    if (isNaN(t)) return "archive";
    if (t >= now) return "open";
    return now - t <= 365 * DAY ? "closed" : "archive";
  }
  document.querySelectorAll("[data-filterlist]").forEach(function (root) {
    var items = Array.prototype.slice.call(root.querySelectorAll("[data-item]"));
    var form = root.querySelector("[data-filter-form]");
    var tabs = Array.prototype.slice.call(root.querySelectorAll("[role=tab][data-value]"));
    var chips = Array.prototype.slice.call(root.querySelectorAll(".chip[data-value]"));
    var countEl = root.querySelector("[data-count]");
    var emptyEl = root.querySelector("[data-empty]");
    var state = {};
    var now = Date.now();
    var labels = { open: root.getAttribute("data-label-open"), closed: root.getAttribute("data-label-closed"), archive: root.getAttribute("data-label-archive") };

    // Recompute tender status from the closing date, so the page stays correct after it was built.
    items.forEach(function (it) {
      var c = it.getAttribute("data-closing");
      if (c === null) return;
      var st = statusFromClosing(c, now);
      it.setAttribute("data-status", st);
      var badge = it.querySelector("[data-status-badge]");
      if (badge && labels[st]) {
        badge.textContent = labels[st];
        badge.className = "badge " + (st === "open" ? "badge--open" : "badge--closed");
      }
    });

    var params = new URLSearchParams(location.search);
    if (form) {
      form.querySelectorAll("[data-filter-key]").forEach(function (el) {
        var k = el.getAttribute("data-filter-key");
        if (params.has(k)) el.value = params.get(k);
        state[k] = el.value;
        el.addEventListener("input", function () { state[k] = el.value; render(); });
        el.addEventListener("change", function () { state[k] = el.value; render(); });
      });
      form.addEventListener("submit", function (e) { e.preventDefault(); });
    }
    function selectTab(v, focus) {
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-value") === v;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      state[tabs[0].getAttribute("data-filter-key")] = v;
      render();
    }
    if (tabs.length) {
      var tk = tabs[0].getAttribute("data-filter-key");
      var initial = params.get(tk) || tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0].getAttribute("data-value");
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { selectTab(t.getAttribute("data-value")); });
        t.addEventListener("keydown", function (e) {
          var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          selectTab(tabs[(i + d + tabs.length) % tabs.length].getAttribute("data-value"), true);
        });
      });
      state[tk] = initial;
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-value") === initial;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
    }
    if (chips.length) {
      var ck = chips[0].getAttribute("data-filter-key");
      state[ck] = params.get(ck) || "";
      chips.forEach(function (c) {
        c.addEventListener("click", function () {
          var v = c.getAttribute("data-value");
          state[ck] = state[ck] === v ? "" : v;
          render();
        });
      });
    }
    function matches(it, ignoreKey) {
      for (var k in state) {
        if (!state.hasOwnProperty(k) || k === ignoreKey) continue;
        var v = (state[k] || "").trim();
        if (!v) continue;
        if (k === "q") {
          var hay = it.getAttribute("data-q") || "";
          var words = v.toLowerCase().split(/\s+/);
          for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
        } else if ((it.getAttribute("data-" + k) || "") !== v) return false;
      }
      return true;
    }
    function render() {
      var shown = 0, total = items.length;
      items.forEach(function (it) {
        var ok = matches(it);
        it.hidden = !ok;
        if (ok) shown++;
      });
      if (tabs.length) {
        var tk = tabs[0].getAttribute("data-filter-key");
        tabs.forEach(function (t) {
          var n = items.filter(function (it) { return it.getAttribute("data-" + tk) === t.getAttribute("data-value") && matches(it, tk); }).length;
          var c = t.querySelector(".count");
          if (c) c.textContent = "(" + n + ")";
        });
        total = items.filter(function (it) { return it.getAttribute("data-" + tk) === state[tk]; }).length;
      }
      chips.forEach(function (c) {
        c.setAttribute("aria-pressed", state[c.getAttribute("data-filter-key")] === c.getAttribute("data-value") ? "true" : "false");
      });
      if (countEl) countEl.textContent = countEl.getAttribute("data-template").replace("{n}", shown).replace("{total}", total);
      if (emptyEl) emptyEl.hidden = shown !== 0;
    }
    render();
  });

  /* ---------- Site search (index is a static file built with the site) ---------- */
  var searchRoot = document.querySelector("[data-search]");
  if (searchRoot && window.SEARCH_INDEX) {
    var input = searchRoot.querySelector("input[name=q]");
    var out = searchRoot.querySelector("[data-search-results]");
    var meta = searchRoot.querySelector("[data-search-meta]");
    var kinds = JSON.parse(searchRoot.getAttribute("data-kinds"));
    var q0 = new URLSearchParams(location.search).get("q") || "";
    input.value = q0;
    function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function hl(text, words) {
      var h = esc(text);
      words.forEach(function (w) {
        if (w.length < 2) return;
        var re = new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
        h = h.replace(re, "<mark>$1</mark>");
      });
      return h;
    }
    function run() {
      var q = input.value.trim();
      var words = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (q.length < 2) { out.innerHTML = ""; meta.textContent = searchRoot.getAttribute("data-empty"); return; }
      var res = [];
      window.SEARCH_INDEX.forEach(function (r) {
        var hay = (r.t + " " + r.x).toLowerCase();
        for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return;
        var score = 0;
        words.forEach(function (w) { if (r.t.toLowerCase().indexOf(w) >= 0) score += 3; });
        if (r.k === "page") score += 1;
        res.push({ r: r, s: score });
      });
      res.sort(function (a, b) { return b.s - a.s; });
      meta.textContent = searchRoot.getAttribute("data-template").replace("{n}", res.length).replace("{q}", q);
      out.innerHTML = res.slice(0, 60).map(function (o) {
        var r = o.r, snippet = r.x.length > 180 ? r.x.slice(0, 180) + "…" : r.x;
        return '<li><span class="badge badge--type">' + esc(kinds[r.k] || r.k) + '</span><h3><a href="' + esc(r.u) + '">' + hl(r.t, words) + "</a></h3>" +
          (snippet ? '<p class="small muted">' + hl(snippet, words) + "</p>" : "") + "</li>";
      }).join("");
    }
    input.addEventListener("input", function () {
      var u = new URL(location.href);
      if (input.value) u.searchParams.set("q", input.value); else u.searchParams.delete("q");
      history.replaceState(null, "", u);
      run();
    });
    searchRoot.querySelector("form").addEventListener("submit", function (e) { e.preventDefault(); run(); });
    run();
  }

  /* ---------- Videos load from YouTube only after the visitor asks (data sovereignty) ---------- */
  document.querySelectorAll("[data-yt-play]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var box = btn.closest("[data-yt]");
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + box.getAttribute("data-yt") + "?autoplay=1";
      f.title = btn.textContent.trim();
      f.allow = "autoplay; encrypted-media; picture-in-picture";
      f.allowFullscreen = true;
      f.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0";
      box.innerHTML = "";
      box.appendChild(f);
    });
  });

  /* ---------- Feedback form (prototype: nothing is sent) ---------- */
  var fb = document.querySelector("[data-feedback]");
  if (fb) {
    fb.addEventListener("submit", function (e) {
      e.preventDefault();
      if (fb.querySelector(".honeypot input").value) return;
      if (!fb.checkValidity()) { fb.reportValidity(); return; }
      var msg = fb.querySelector("[data-done]");
      msg.hidden = false;
      msg.focus();
      fb.reset();
    });
  }
})();
