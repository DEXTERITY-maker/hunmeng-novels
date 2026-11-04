// Release announcements: change data-release in index.html when publishing a
// new feature set. The dialog appears once per release and remains reopenable.
(() => {
  "use strict";
  const dialog = document.getElementById("whats-new-dialog");
  const trigger = document.getElementById("whats-new-open");
  const dismiss = document.getElementById("whats-new-dismiss");
  const close = document.getElementById("whats-new-close");
  const tryEditor = document.getElementById("whats-new-try");
  if (!dialog || !trigger || !dismiss || !close || !tryEditor || typeof dialog.showModal !== "function") return;

  const storageKey = "anons-studio:whats-new:seen";
  const release = dialog.dataset.release;
  if (!release) return;
  let returnFocus = null;

  function readSeen() {
    try { return localStorage.getItem(storageKey) === release; }
    catch { return false; }
  }
  function rememberSeen() {
    try { localStorage.setItem(storageKey, release); }
    catch { /* Private browsing may restrict storage. */ }
  }
  function open(manual = false) {
    if (dialog.open) return;
    returnFocus = manual ? trigger : null;
    try {
      dialog.showModal();
      document.documentElement.classList.add("whats-new-visible");
      close.focus();
    } catch {
      document.documentElement.classList.remove("whats-new-visible");
    }
  }
  function hide() {
    if (dialog.open) dialog.close();
  }

  trigger.addEventListener("click", () => open(true));
  dismiss.addEventListener("click", hide);
  close.addEventListener("click", hide);
  tryEditor.addEventListener("click", hide);
  dialog.addEventListener("click",event=>{if(event.target.closest("a"))hide();});
  dialog.addEventListener("click", event => {
    // Clicking the translucent backdrop closes without requiring a precise tap.
    if (event.target === dialog) hide();
  });
  dialog.addEventListener("close", () => {
    rememberSeen();
    document.documentElement.classList.remove("whats-new-visible");
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  });

  // Avoid interrupting password-recovery and explicit account-navigation flows.
  const isAccountFlow = () => {
    const fragment = location.hash.toLowerCase();
    const params = new URLSearchParams(location.search);
    return fragment === "#account" || /(?:access_token|refresh_token|type=recovery|error=)/.test(fragment)
      || params.has("code") || params.has("error") || params.get("type") === "recovery";
  };
  window.setTimeout(() => {
    if (readSeen() || isAccountFlow() || document.visibilityState === "hidden") return;
    // Do not interrupt people who have already started typing in a form.
    if (document.activeElement?.matches?.("input, textarea, select, [contenteditable]")) return;
    open();
  }, 850);
})();
