// Accessible catalogue enhancement for the six editor-compatible templates.
// No authentication, payments or editor draft data are changed.
(() => {
  "use strict";
  const gallery = document.querySelector("#templates .template-gallery");
  const controls = document.getElementById("catalog-controls");
  if (!gallery || !controls) return;

  const entries = {
    aurora:   { name: "Aurora",   categories: ["update", "launch"],   keywords: "атмосферные обновления игра обновление релиз свет эффект" },
    editorial:{ name: "Editorial",categories: ["update", "universal"],keywords: "редакционный типографика премиальный стиль блог статья публикация" },
    spotlight:{ name: "Spotlight",categories: ["launch", "universal"],keywords: "запуск премьера презентация продукт новый проект яркий" },
    pulse:    { name: "Pulse",    categories: ["event", "launch"],    keywords: "мероприятие событие концерт акция энергичный динамичный" },
    minimal:  { name: "Minimal",  categories: ["universal", "news"], keywords: "минимализм минималистичный лаконичный объявление бизнес текст" },
    bulletin: { name: "Bulletin", categories: ["news", "update"],    keywords: "новости важное информационная карточка уведомление" },
    "business-brief":{ name:"Business Brief",categories:["news","update","universal"],keywords:"бизнес деловой сводка отчёт руководство бизнес новости",premium:true },
    "business-pitch":{ name:"Business Pitch",categories:["launch","universal"],keywords:"бизнес деловая презентация запуск продукт стартап питч",premium:true },
    "business-report":{ name:"Business Report",categories:["news","universal"],keywords:"бизнес аналитика итоги отчёт метрики показатели",premium:true }
  };

  const search = document.getElementById("template-search");
  const chips = [...controls.querySelectorAll("[data-catalog-category]")];
  const favoritesToggle = document.getElementById("template-favorites-toggle");
  const favoritesCount = document.getElementById("template-favorites-count");
  const sort = document.getElementById("template-sort");
  const count = document.getElementById("template-results-count");
  const empty = document.getElementById("template-empty");
  const reset = document.getElementById("template-reset");
  if (!search || !favoritesToggle || !favoritesCount || !sort || !count || !empty || !reset) return;

  const key = "anons-studio:favorite-templates:v1";
  const ids = Object.keys(entries);
  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").trim();
  function loadFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(value)) return new Set();
      return new Set(value.filter((id) => ids.includes(id)));
    } catch { return new Set(); }
  }
  let favorites = loadFavorites();
  let category = "all";
  let showFavorites = false;
  let paidAccess = false;
  const cards = [];

  [...gallery.querySelectorAll(":scope > a.template-card")].forEach((link) => {
    const id = link.dataset.template;
    const info = entries[id];
    if (!info) return;
    const item = document.createElement("div");
    item.className = "catalog-item";
    item.dataset.category = info.categories.join(" ");
    link.parentNode.insertBefore(item, link);
    item.append(link);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "catalog-favorite";
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="m12 2.8 2.85 5.78 6.38.93-4.62 4.5 1.09 6.36L12 17.37l-5.7 3 1.09-6.36-4.62-4.5 6.38-.93L12 2.8Z"/></svg>';
    item.append(button);
    if(info.premium){
      link.classList.add("template-locked");
      link.setAttribute("aria-label",info.name+" — шаблон тарифа Бизнес");
      link.addEventListener("click",event=>{
        if(!paidAccess){
          event.preventDefault();
          window.location.assign("./pricing.html#manual-order-root");
        }
      });
    }
    const keywords = normalize([info.name, info.keywords, link.textContent].join(" "));
    cards.push({ id, info, item, button, keywords });
    button.addEventListener("click", () => {
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      try { localStorage.setItem(key, JSON.stringify([...favorites])); }
      catch { /* Browsers may disable persistent storage. */ }
      render();
    });
  });

  function render() {
    const q = normalize(search.value);
    let visible = 0;
    const ordered = [...cards];
    if (sort.value === "name") ordered.sort((a, b) => a.info.name.localeCompare(b.info.name, "ru"));
    ordered.forEach((card) => gallery.append(card.item));

    cards.forEach(({ id, info, item, button, keywords }) => {
      const link=item.querySelector?.("a.template-card")||item.children?.[0];
      if(info.premium&&link){
        link.classList.toggle("template-locked",!paidAccess);
        link.setAttribute("aria-label",info.name+(paidAccess?" — доступен":" — требуется подписка Бизнес"));
        link.title=paidAccess?"Открыть в редакторе":"Для доступа требуется подписка Бизнес";
      }
      const selected = favorites.has(id);
      button.classList.toggle("is-favorite", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", (selected ? "Удалить " : "Добавить ") + info.name + (selected ? " из избранного" : " в избранное"));
      button.title = selected ? "Удалить из избранного" : "Добавить в избранное";
      const matches = (category === "all" || info.categories.includes(category))
        && (!showFavorites || selected)
        && (!q || keywords.includes(q));
      item.hidden = !matches;
      if (matches) visible++;
    });
    chips.forEach((chip) => {
      const active = chip.dataset.catalogCategory === category;
      chip.setAttribute("aria-pressed", String(active));
      chip.classList.toggle("is-active", active);
    });
    favoritesToggle.setAttribute("aria-pressed", String(showFavorites));
    favoritesToggle.classList.toggle("is-active", showFavorites);
    favoritesCount.textContent = String(favorites.size);
    count.textContent = "Найдено шаблонов: " + visible + " из " + cards.length;
    empty.hidden = visible > 0;
  }

  chips.forEach((chip) => chip.addEventListener("click", () => {
    category = chip.dataset.catalogCategory;
    render();
  }));
  window.addEventListener("anons:access",event=>{
    paidAccess=event.detail?.premium===true&&["basic","pro","studio"].includes(event.detail?.plan);
    render();
  });
  search.addEventListener("input", render);
  sort.addEventListener("change", render);
  favoritesToggle.addEventListener("click", () => {
    showFavorites = !showFavorites;
    render();
  });
  reset.addEventListener("click", () => {
    search.value = "";
    category = "all";
    showFavorites = false;
    sort.value = "default";
    render();
    search.focus();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      favorites = loadFavorites();
      render();
    }
  });

  if (cards.length) {
    controls.hidden = false;
    count.hidden = false;
    render();
  }
})();