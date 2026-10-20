"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Registers the service worker and shows an "Install app" button where the browser supports it.
 *  Chrome / Edge on Windows and Android fire `beforeinstallprompt`; iOS Safari never does, so there we
 *  show a one-line hint. Nothing renders once the app is already running installed. */
export default function InstallApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
    setIos(isIos);

    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (prompt) {
    return (
      <button className="btn ghost sm" onClick={async () => { await prompt.prompt(); const { outcome } = await prompt.userChoice; if (outcome === "accepted") setPrompt(null); }}>
        Install app
      </button>
    );
  }
  if (ios) {
    return (
      <span className="install-ios">
        <button className="btn ghost sm" onClick={() => setShowIosHint((v) => !v)} aria-expanded={showIosHint}>Install app</button>
        {showIosHint && <span className="hint">In Safari: tap <b>Share</b> → <b>Add to Home Screen</b></span>}
      </span>
    );
  }
  return null;
}
