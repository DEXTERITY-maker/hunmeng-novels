// Editor-only responsive navigation. Canvas state and cloud drafts remain owned
// by app.js and library-entry.js; switching panels never mutates project data.
(() => {
  "use strict";
  const workspace = document.querySelector("#editor .workspace");
  const toolbar = document.querySelector(".editor-view-switch");
  const buttons = [...document.querySelectorAll("[data-workspace-view]")];
  const previewAction = document.getElementById("editor-show-preview");
  if (!workspace || !toolbar || buttons.length !== 2 || !previewAction) return;

  const mobile = window.matchMedia("(max-width: 760px)");
  function setView(view, fromInsidePanel = false) {
    if (view !== "edit" && view !== "preview") return;
    workspace.dataset.mobileView = view;
    for (const button of buttons) {
      const active = button.dataset.workspaceView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    if (mobile.matches) {
      // The toolbar is sticky and both panels share a viewport position.
      toolbar.scrollIntoView({block: "start", behavior: "auto"});
      if (fromInsidePanel) {
        buttons.find(button => button.dataset.workspaceView === view)
          ?.focus({preventScroll: true});
      }
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => setView(button.dataset.workspaceView));
  }
  previewAction.addEventListener("click", () => setView("preview", true));

  // If a deep link targets a tool group, make the settings visible first.
  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#editor-group-")) setView("edit");
  });
  if (location.hash.startsWith("#editor-group-")) setView("edit");
})();
