/* Get the app: detects the device, offers the one-tap install where the browser supports it, and highlights the right steps. */
(function () {
  const $ = (id) => document.getElementById(id);
  const ua = navigator.userAgent || "";
  // iPadOS reports itself as a Mac, so check for touch too.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const inApp = /FBAN|FBAV|Instagram|Line\/|GSA\/|Twitter|LinkedInApp|Snapchat|TikTok/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

  const mine = ios ? "card-ios" : android ? "card-android" : "card-desktop";
  $(mine).classList.add("mine");

  if (standalone) {
    $("installed").hidden = false;
    $("quick").hidden = true;
    return;
  }

  if (ios) {
    $("quick-k").textContent = "iPhone + iPad";
    $("quick-note").textContent = inApp
      ? "Open this page in Safari first, then tap Share → Add to Home Screen."
      : "Tap Share, then Add to Home Screen. Steps below.";
    $("ios-inapp").hidden = !inApp;
  } else if (android) {
    $("quick-k").textContent = "Android";
    $("quick-note").textContent = inApp
      ? "Open this page in Chrome first, then tap Install app."
      : "Tap Install app below, or use the browser menu.";
  } else {
    $("quick-k").textContent = "Desktop";
    $("quick-note").textContent = "Install from the address bar, or use the button below when it appears.";
  }

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    $("install-btn").hidden = false;
  });

  $("install-btn").addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null;
    $("install-btn").hidden = true;
    if (!choice || choice.outcome !== "accepted") $("install-status").textContent = "Install canceled. You can install any time from the browser menu.";
  });

  window.addEventListener("appinstalled", () => {
    $("install-btn").hidden = true;
    $("install-status").textContent = "Installed. Open OFS Domains from your home screen or app list.";
  });
})();
