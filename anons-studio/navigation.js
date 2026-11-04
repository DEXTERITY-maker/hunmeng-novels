// Progressive mobile navigation; independent of the editor and authentication.
(() => {
  "use strict";
  const toggle = document.getElementById("mobile-menu-toggle");
  const navigation = document.getElementById("primary-navigation");
  if (!toggle || !navigation) return;
  const isMobile = window.matchMedia("(max-width: 760px)");

  function setOpen(open, restoreFocus = false) {
    const wasOpen = navigation.classList.contains("is-open");
    const next = Boolean(open && isMobile.matches);
    navigation.classList.toggle("is-open", next);
    toggle.setAttribute("aria-expanded", String(next));
    toggle.setAttribute("aria-label", next ? "Закрыть меню" : "Открыть меню");
    const icon = toggle.querySelector(".mobile-menu-icon");
    if (icon) icon.textContent = next ? "×" : "☰";
    if (!next && wasOpen && restoreFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    setOpen(!navigation.classList.contains("is-open"));
  });
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navigation.classList.contains("is-open")) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (navigation.classList.contains("is-open")
      && !navigation.contains(event.target)
      && !toggle.contains(event.target)) setOpen(false);
  });
  window.addEventListener("resize", () => {
    if (!isMobile.matches) setOpen(false);
  });
})();
