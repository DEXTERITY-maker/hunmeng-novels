// Progressive, local-only helper: combines existing editor presets with approved compositions.
(() => {
  "use strict";
  const root = document.getElementById("template-assistant");
  if (!root) return;

  const purpose = document.getElementById("assistant-purpose");
  const mood = document.getElementById("assistant-mood");
  const title = document.getElementById("assistant-result-title");
  const reason = document.getElementById("assistant-result-reason");
  const image = document.getElementById("assistant-result-art");
  const action = document.getElementById("assistant-open");
  if (![purpose, mood, title, reason, image, action].every(Boolean)) return;

  const choices = Object.freeze({
    update: {
      calm: ["minimal", "Минималистичная композиция помогает спокойно и понятно рассказать об изменениях."],
      bold: ["aurora", "Яркие акценты подчёркивают масштаб обновления."],
      editorial: ["editorial", "Выразительная типографика делает обновление похожим на профессиональную публикацию."]
    },
    launch: {
      calm: ["minimal", "Чистая композиция хорошо подходит для лаконичной презентации проекта."],
      bold: ["spotlight", "Крупный заголовок помогает привлечь внимание к запуску."],
      editorial: ["editorial", "Редакционная эстетика подходит для премиальной презентации нового продукта."]
    },
    event: {
      calm: ["bulletin", "Структурный макет помогает быстро донести важные сведения о событии."],
      bold: ["pulse", "Динамичная композиция передаёт энергию мероприятия."],
      editorial: ["editorial", "Строгая типографика подчёркивает статус мероприятия."]
    },
    notice: {
      calm: ["bulletin", "Чёткое расположение блоков помогает легко прочитать важную новость."],
      bold: ["spotlight", "Контрастная композиция выделяет сообщение в ленте."],
      editorial: ["editorial", "Редакционный стиль придаёт информационной публикации аккуратный вид."]
    }
  });
  const labels = Object.freeze({
    aurora: "Aurora", editorial: "Editorial", spotlight: "Spotlight",
    pulse: "Pulse", minimal: "Minimal", bulletin: "Bulletin"
  });

  function update() {
    const goal = Object.hasOwn(choices, purpose.value) ? purpose.value : "update";
    const style = Object.hasOwn(choices[goal], mood.value) ? mood.value : "bold";
    const [template, message] = choices[goal][style];
    title.textContent = "Рекомендуем " + labels[template];
    reason.textContent = message;
    action.href = "./editor.html?template=" + encodeURIComponent(template)
      + "&preset=" + encodeURIComponent(goal);
    const art = document.querySelector('.template-card[data-template="' + template + '"] .template-art');
    if (art) image.replaceChildren(art.cloneNode(true));
    else image.textContent = labels[template];
    root.dataset.recommendation = template;
  }

  purpose.addEventListener("change", update);
  mood.addEventListener("change", update);
  update();
})();
