/** OFS Domains — loading screen + homepage video tour (narrated, or recorded videos from assets/tour/tour.json). */
(function () {
  const root = document.documentElement;
  const LOADER_KEY = "ofs.loader.seen";
  const TOUR_HIDE_KEY = "ofs.tour.hide.v1";
  const TOUR_SESSION_KEY = "ofs.tour.shown";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(s, k) { try { return s.getItem(k); } catch (_) { return null; } },
    set(s, k, v) { try { s.setItem(k, v); } catch (_) {} },
    del(s, k) { try { s.removeItem(k); } catch (_) {} },
  };
  const loaderSkipped = Boolean(store.get(sessionStorage, LOADER_KEY)) || /[?&]noloader\b/.test(location.search);
  root.classList.add(loaderSkipped ? "ofs-skip-loader" : "ofs-loading");

  let loaderDone = loaderSkipped;
  const afterLoader = [];
  function whenLoaderDone(fn) { loaderDone ? fn() : afterLoader.push(fn); }

  /* ---------- Loading screen ---------- */
  function runLoader() {
    const el = document.getElementById("ofs-loader");
    if (!el || loaderSkipped) { if (el) el.remove(); return; }
    const bar = el.querySelector(".ofs-depth i");
    const label = el.querySelector(".ofs-depth-label");
    const MIN = reduce ? 600 : 2000, MAX = 7000;
    const start = performance.now();
    let pageReady = document.readyState === "complete", finished = false;
    window.addEventListener("load", () => { pageReady = true; }, { once: true });

    function finish() {
      if (finished) return;
      finished = true;
      store.set(sessionStorage, LOADER_KEY, "1");
      if (bar) bar.style.width = "100%";
      if (label) label.textContent = "Arrived · 1,000 m";
      el.classList.add("done");
      root.classList.remove("ofs-loading");
      setTimeout(() => el.remove(), 700);
      loaderDone = true;
      afterLoader.splice(0).forEach((fn) => fn());
    }
    function tick(now) {
      if (finished) return;
      const t = now - start;
      // Ease toward 90% while waiting, then complete once the page is ready.
      const pct = Math.min(pageReady ? 100 : 90, (t / MIN) * 100);
      if (bar) bar.style.width = pct.toFixed(1) + "%";
      if (label) label.textContent = "Descending · " + Math.round(pct * 10).toLocaleString() + " m";
      if ((pageReady && t >= MIN) || t >= MAX) return setTimeout(finish, 250);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    const skip = el.querySelector(".ofs-loader-skip");
    if (skip) skip.addEventListener("click", finish);
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape" && !finished) { finish(); document.removeEventListener("keydown", onKey); }
    });
  }

  /* ---------- Tour content ---------- */
  const HOST_NAME = "Marina";
  const SCENES = [
    { icon: "🌊", title: "Welcome to OFS Domains", body: "Claim a real name, let AI build the site, and go live on web and Web3.",
      say: "Hi, I'm Marina, your guide to O F S Domains. In about a minute, I'll show you how to go from an idea to a live website." },
    { icon: "💬", title: "1 · Describe it", body: "Tell the build desk on Home what you want. Attach files with the + button.",
      say: "Start right here on Home. Tell the build desk what you want to build, in your own words. You can attach images, documents, or a zip with the plus button. When it suggests a build, tap Open build workflow, and your brief comes with you." },
    { icon: "✍️", title: "2 · Check the brief", body: "Edit the brief, business name, logo, and description. The name comes from your brief.",
      say: "Next, check your brief. You can edit the business name, logo, and description. Your domain name is built from the first words of your brief." },
    { icon: "⚙️", title: "3 · Run the platform", body: "It picks the name and plan, and lists it on web, Web3, or both at no extra cost.",
      say: "Then run the platform. It picks the name and the plan for you. Claim is ten dollars, O F S One is ninety nine, and Abyss One is two ninety nine a month. Listing on the web, Web3, or both costs nothing extra." },
    { icon: "🏠", title: "4 · Profile and site", body: "Your profile and hosted site are saved — and linked to your account when signed in.",
      say: "Your profile and hosted site are saved automatically. Sign in, and every project is kept safely on your account." },
    { icon: "💳", title: "5 · Pay", body: "Checkout opens with your quote through Stripe.",
      say: "When you're ready, checkout opens with your quote, and you pay securely through Stripe." },
    { icon: "🚀", title: "6 · Go live", body: "Go Live binds the name and publishes your site. Manage it any time from Host, Profile, and Vault.",
      say: "Finally, Go Live binds your name and publishes your site. You can manage everything later from Host, Profile, and Vault. That's it! Tap the build desk and tell me what you'd like to create." },
  ];

  const FEMALE_VOICE = /(female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|allison|ava|susan|zira|aria|jenny|sonia|libby|natasha|hazel|catherine|joanna|salli|kendra|kimberly|ivy|emma|olivia|google uk english female|google us english)/i;
  const MALE_VOICE = /(male\b|daniel|alex|fred|david|mark|george|guy|ryan|tom|aaron|arthur|oliver|rishi|gordon|thomas|james|google uk english male)/i;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    if (!voices.length) return null;
    const female = voices.filter((v) => FEMALE_VOICE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, "")));
    const ranked = (female.length ? female : voices.filter((v) => !MALE_VOICE.test(v.name)))
      .sort((a, b) => score(b) - score(a));
    return ranked[0] || voices[0];
    function score(v) {
      let s = 0;
      if (/natural|neural|premium|enhanced|online/i.test(v.name)) s += 4;
      if (/google|microsoft/i.test(v.name)) s += 2;
      if (/en-US|en-GB/i.test(v.lang)) s += 1;
      if (v.localService === false) s += 1;
      return s;
    }
  }

  function el(tag, attrs, html) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
  const HOST_SVG =
    '<svg viewBox="0 0 200 200" aria-hidden="true">' +
    '<circle class="ring" cx="100" cy="100" r="86"/><circle class="ring r2" cx="100" cy="100" r="86"/><circle class="ring r3" cx="100" cy="100" r="86"/>' +
    '<g class="bob">' +
    '<circle cx="100" cy="100" r="78" fill="#0d3540" stroke="rgba(207,228,220,.35)"/>' +
    '<path d="M44 150c4-50 20-92 56-92s52 42 56 92c-10 8-20 12-30 12l-4-50-22-24-22 24-4 50c-10 0-20-4-30-12z" fill="#2a1b17"/>' +
    '<ellipse cx="100" cy="104" rx="34" ry="40" fill="#e8b996"/>' +
    '<path d="M64 98c2-30 18-44 36-44s34 14 36 44c-14-6-26-20-30-30-8 16-26 26-42 30z" fill="#2a1b17"/>' +
    '<g class="eyes"><ellipse cx="87" cy="100" rx="3.6" ry="4.4" fill="#1d2a2e"/><ellipse cx="113" cy="100" rx="3.6" ry="4.4" fill="#1d2a2e"/></g>' +
    '<circle cx="80" cy="114" r="5" fill="#f19c8f" opacity=".35"/><circle cx="120" cy="114" r="5" fill="#f19c8f" opacity=".35"/>' +
    '<ellipse class="mouth" cx="100" cy="126" rx="8" ry="5" fill="#9c3c3f"/>' +
    '<path d="M60 178c8-22 24-32 40-32s32 10 40 32" fill="#cfe4dc"/>' +
    '<circle cx="66" cy="112" r="3" fill="#cfe4dc"/><circle cx="134" cy="112" r="3" fill="#cfe4dc"/>' +
    '</g></svg>';

  /* ---------- Tour dialog ---------- */
  let tour = null;

  function buildTour() {
    const wrap = el("div", { class: "ofs-tour", id: "ofs-tour", role: "dialog", "aria-modal": "true", "aria-labelledby": "ofs-tour-title", hidden: "" });
    wrap.innerHTML =
      '<div class="ofs-tour-box">' +
        '<div class="ofs-tour-head"><div><div class="k">Video tour</div><h2 id="ofs-tour-title">How OFS Domains works</h2></div>' +
        '<button type="button" class="ofs-tour-x" aria-label="Close tour">×</button></div>' +
        '<div class="ofs-stage"></div>' +
        '<div class="ofs-chapters" aria-label="Chapters"></div>' +
        '<div class="ofs-progress" aria-label="Tour steps"></div>' +
        '<p class="ofs-caption" aria-live="polite"></p>' +
        '<div class="ofs-controls">' +
          '<button type="button" data-act="prev" aria-label="Previous step">‹ Back</button>' +
          '<button type="button" data-act="toggle" class="primary">Play</button>' +
          '<button type="button" data-act="next" aria-label="Next step">Next ›</button>' +
          '<button type="button" data-act="mute" aria-pressed="false">Sound on</button>' +
          '<span class="grow"></span>' +
          '<label><input type="checkbox" data-act="hide" /> Don\'t show again</label>' +
          '<button type="button" data-act="close">Start exploring</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    const $ = (s) => wrap.querySelector(s);
    const stage = $(".ofs-stage"), caption = $(".ofs-caption"), progress = $(".ofs-progress"), chapters = $(".ofs-chapters");
    const btnToggle = $('[data-act="toggle"]'), btnPrev = $('[data-act="prev"]'), btnNext = $('[data-act="next"]'), btnMute = $('[data-act="mute"]');
    const hideBox = $('[data-act="hide"]');
    hideBox.checked = store.get(localStorage, TOUR_HIDE_KEY) === "1";
    hideBox.addEventListener("change", () => hideBox.checked ? store.set(localStorage, TOUR_HIDE_KEY, "1") : store.del(localStorage, TOUR_HIDE_KEY));

    let mode = "narrated", videos = [], idx = 0, playing = false, started = false, muted = false;
    let lastFocus = null, rafId = 0, timer = 0, token = 0;
    const speechOK = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";

    /* Recorded videos from the manifest, when present. */
    const ready = fetch("./assets/tour/tour.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => { videos = (m && Array.isArray(m.videos) ? m.videos : []).filter((v) => v && v.src); if (videos.length) mode = "video"; })
      .catch(() => {})
      .then(render);

    function count() { return mode === "video" ? videos.length : SCENES.length; }

    function render() {
      stage.innerHTML = "";
      progress.innerHTML = "";
      chapters.innerHTML = "";
      if (mode === "video") renderVideo(); else renderNarrated();
      for (let i = 0; i < count(); i++) {
        const b = el("button", { type: "button", "aria-label": "Go to step " + (i + 1) }, "<i><b></b></i>");
        b.addEventListener("click", () => go(i, true));
        progress.appendChild(b);
      }
      if (mode === "video" && videos.length > 1) videos.forEach((v, i) => {
        const b = el("button", { type: "button" });
        b.textContent = v.title || "Part " + (i + 1);
        b.addEventListener("click", () => go(i, true));
        chapters.appendChild(b);
      });
      if (mode === "narrated" && !speechOK) muted = true;
      btnMute.hidden = mode === "video" || !speechOK;
      const start = el("button", { type: "button", class: "ofs-start" },
        '<span class="play">' + PLAY_SVG + '</span><span class="lbl">Play the tour</span>' +
        '<span class="sub">' + (mode === "video" ? "Watch with sound" : (speechOK ? "About 1 minute · with voice and captions" : "About 1 minute · captions")) + "</span>");
      start.addEventListener("click", () => { start.hidden = true; started = true; go(idx, true); });
      stage.appendChild(start);
      showStep(idx);
      sync();
    }

    function renderNarrated() {
      const p = el("div", { class: "ofs-presenter" });
      p.innerHTML = '<div class="ofs-host">' + HOST_SVG + '<span class="ofs-host-name">' + HOST_NAME + ' · guide</span></div><div class="ofs-scene"></div>';
      stage.appendChild(p);
    }

    let video = null;
    function renderVideo() {
      video = el("video", { playsinline: "", preload: "metadata", controls: "" });
      video.addEventListener("ended", () => { markDone(idx); idx < count() - 1 ? go(idx + 1, true) : complete(); });
      video.addEventListener("timeupdate", () => setBar(idx, video.duration ? video.currentTime / video.duration : 0));
      video.addEventListener("play", () => { playing = true; sync(); });
      video.addEventListener("pause", () => { playing = false; sync(); });
      video.addEventListener("error", () => { if (mode === "video") { mode = "narrated"; videos = []; idx = 0; render(); } });
      stage.appendChild(video);
    }

    function showStep(i) {
      idx = Math.max(0, Math.min(i, count() - 1));
      [...progress.children].forEach((b, n) => {
        b.classList.toggle("done", n < idx);
        b.setAttribute("aria-current", n === idx ? "step" : "false");
        if (n >= idx) setBar(n, 0);
      });
      [...chapters.children].forEach((b, n) => b.classList.toggle("on", n === idx));
      if (mode === "video") {
        const v = videos[idx];
        caption.hidden = true;
        // Only swap the source when the step changes, so Resume continues where the viewer paused.
        if (video.dataset.step !== String(idx)) {
          video.dataset.step = String(idx);
          video.src = v.src;
          if (v.poster) video.poster = v.poster; else video.removeAttribute("poster");
          video.querySelectorAll("track").forEach((t) => t.remove());
          if (v.captions) video.appendChild(el("track", { kind: "captions", src: v.captions, srclang: "en", label: "English", default: "" }));
        }
        if (v.title) $("#ofs-tour-title").textContent = v.title;
      } else {
        const s = SCENES[idx], scene = stage.querySelector(".ofs-scene");
        scene.classList.remove("enter");
        scene.innerHTML = '<div class="ofs-scene-icon" aria-hidden="true">' + s.icon + '</div><div class="ofs-scene-step">STEP ' + (idx + 1) + " OF " + SCENES.length + "</div><h3></h3><p></p>";
        scene.querySelector("h3").textContent = s.title;
        scene.querySelector("p").textContent = s.body;
        void scene.offsetWidth;
        scene.classList.add("enter");
        caption.hidden = false;
        caption.textContent = s.say;
      }
      sync();
    }

    function setBar(i, f) { const b = progress.children[i]; if (b) b.querySelector("b").style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + "%"; }
    function markDone(i) { const b = progress.children[i]; if (b) { b.classList.add("done"); setBar(i, 1); } }

    function stopNarration() {
      token++;
      cancelAnimationFrame(rafId); clearTimeout(timer);
      if (speechOK) speechSynthesis.cancel();
      wrap.classList.remove("ofs-speaking");
    }

    function speakScene() {
      stopNarration();
      const my = token, s = SCENES[idx];
      const words = s.say.split(/\s+/).length;
      const est = Math.max(3000, (words / 2.6) * 1000);
      const t0 = performance.now();
      playing = true; sync();
      const animate = () => {
        if (my !== token) return;
        setBar(idx, Math.min(0.97, (performance.now() - t0) / est));
        rafId = requestAnimationFrame(animate);
      };
      rafId = requestAnimationFrame(animate);
      const advance = () => {
        if (my !== token) return;
        cancelAnimationFrame(rafId);
        wrap.classList.remove("ofs-speaking");
        markDone(idx);
        if (idx < SCENES.length - 1) timer = setTimeout(() => { if (my === token) { showStep(idx + 1); speakScene(); } }, 700);
        else complete();
      };
      if (muted || !speechOK) { timer = setTimeout(advance, est + 600); return; }
      // Speak sentence by sentence — long single utterances get cut off in some browsers.
      const parts = s.say.match(/[^.!?]+[.!?]*/g) || [s.say];
      const voice = pickVoice();
      let n = 0, watchdog = 0;
      const next = () => {
        if (my !== token) return;
        clearTimeout(watchdog);
        if (n >= parts.length) return advance();
        const u = new SpeechSynthesisUtterance(parts[n++].trim());
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
        u.rate = 0.98; u.pitch = voice && FEMALE_VOICE.test(voice.name) ? 1.05 : 1.2;
        u.onstart = () => { if (my === token) wrap.classList.add("ofs-speaking"); };
        let done = false;
        const once = () => { if (!done) { done = true; next(); } };
        u.onend = once;
        u.onerror = (e) => { if (my === token && e.error !== "interrupted" && e.error !== "canceled") once(); };
        // If the browser never fires end (some mobile engines), keep the tour moving.
        watchdog = setTimeout(once, Math.max(4000, u.text.split(/\s+/).length * 700));
        speechSynthesis.speak(u);
      };
      next();
    }

    function go(i, autoplay) {
      if (mode === "narrated") stopNarration();
      delete btnToggle.dataset.replay;
      if (!started) { started = true; const st = stage.querySelector(".ofs-start"); if (st) st.hidden = true; }
      showStep(i);
      if (!autoplay) { if (mode === "video") video.pause(); playing = false; sync(); return; }
      if (mode === "video") { const p = video.play(); if (p && p.catch) p.catch(() => { playing = false; sync(); }); }
      else speakScene();
    }

    function pause() {
      if (mode === "video") video.pause();
      else { stopNarration(); playing = false; setBar(idx, 0); sync(); }
    }

    function complete() {
      playing = false;
      store.set(localStorage, TOUR_HIDE_KEY, "1");
      hideBox.checked = true;
      btnToggle.dataset.replay = "1";
      sync();
    }

    function sync() {
      btnToggle.textContent = btnToggle.dataset.replay ? "Replay" : playing ? "Pause" : started ? "Resume" : "Play";
      btnPrev.disabled = idx === 0;
      btnNext.disabled = idx >= count() - 1;
      btnMute.textContent = muted ? "Sound off" : "Sound on";
      btnMute.setAttribute("aria-pressed", String(muted));
    }

    btnToggle.addEventListener("click", () => {
      if (btnToggle.dataset.replay) return go(0, true);
      playing ? pause() : go(idx, true);
    });
    btnPrev.addEventListener("click", () => go(idx - 1, playing));
    btnNext.addEventListener("click", () => { const keep = playing; markDone(idx); go(idx + 1, keep); });
    btnMute.addEventListener("click", () => { muted = !muted; sync(); if (playing && mode === "narrated") speakScene(); });
    $(".ofs-tour-x").addEventListener("click", close);
    $('[data-act="close"]').addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "Tab") {
        const f = [...wrap.querySelectorAll("button:not([disabled]):not([hidden]), input, video[controls]")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden && playing) pause(); });
    window.addEventListener("pagehide", stopNarration);

    function open() {
      if (!wrap.hidden) return;
      lastFocus = document.activeElement;
      store.set(sessionStorage, TOUR_SESSION_KEY, "1");
      wrap.hidden = false;
      requestAnimationFrame(() => wrap.classList.add("open"));
      setLauncher(false);
      ready.then(() => { const st = stage.querySelector(".ofs-start"); (st && !st.hidden ? st : btnToggle).focus(); });
    }
    function close() {
      pause();
      wrap.classList.remove("open");
      setTimeout(() => { wrap.hidden = true; }, reduce ? 0 : 250);
      setLauncher(true);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    return { open, close };
  }

  let launcher = null;
  function setLauncher(show) { if (launcher) launcher.hidden = !show; }

  function openTour() {
    if (!tour) tour = buildTour();
    tour.open();
  }

  function initTour() {
    if (!document.body.hasAttribute("data-ofs-tour")) return;
    launcher = el("button", { type: "button", class: "ofs-tour-launch", "aria-label": "Watch the platform tour" },
      PLAY_SVG + "<span>Watch the tour</span>");
    launcher.addEventListener("click", openTour);
    document.body.appendChild(launcher);
    document.querySelectorAll("[data-open-tour]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); openTour(); }));
    if ("speechSynthesis" in window) speechSynthesis.getVoices();

    const wantsTour = /[?&]tour\b/.test(location.search);
    const autoOpen = wantsTour || (store.get(localStorage, TOUR_HIDE_KEY) !== "1" && !store.get(sessionStorage, TOUR_SESSION_KEY));
    if (autoOpen) whenLoaderDone(() => setTimeout(openTour, reduce ? 0 : 450));
  }

  window.OFSTour = { open: openTour };

  function boot() { runLoader(); initTour(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
