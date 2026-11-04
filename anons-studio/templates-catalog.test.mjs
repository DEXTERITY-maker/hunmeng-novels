import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

class Element {
  constructor(tag = "div") {
    this.tag = tag; this.children = []; this.parentNode = null;
    this.dataset = {}; this.attrs = {}; this.events = {};
    this.hidden = false; this.value = ""; this.textContent = "";
    const classes = new Set();
    this.classList = { toggle(name, enabled) {
      if (enabled) classes.add(name); else classes.delete(name);
    } };
  }
  append(child) {
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((part) => part !== child);
    this.children.push(child);
    child.parentNode = this;
  }
  insertBefore(child, before) {
    this.children.splice(this.children.indexOf(before), 0, child);
    child.parentNode = this;
  }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  fire(name) { this.events[name]?.({ target: this }); }
  querySelectorAll() { return this.children.filter((part) => part.tag === "a"); }
  focus() { this.focused = true; }
}

function setup() {
  const gallery = new Element("gallery");
  ["aurora", "editorial", "spotlight", "pulse", "minimal", "bulletin", "business-brief", "business-pitch", "business-report"].forEach((id) => {
    const card = new Element("a");
    card.dataset.template = id;
    card.textContent = id;
    gallery.append(card);
  });
  const controls = new Element();
  controls.hidden = true;
  const categories = ["all", "update", "launch", "event", "news", "universal"]
    .map((category) => { const button = new Element("button"); button.dataset.catalogCategory = category; return button; });
  controls.querySelectorAll = () => categories;
  const elements = Object.fromEntries(["template-search", "template-favorites-toggle", "template-favorites-count", "template-sort", "template-results-count", "template-empty", "template-reset"].map((id) => [id, new Element()]));
  elements["template-sort"].value = "default";
  elements["template-results-count"].hidden = true;
  elements["template-empty"].hidden = true;
  elements["catalog-controls"] = controls;
  const store = {};
  const context = {
    document: { querySelector: () => gallery, getElementById: (id) => elements[id], createElement: (tag) => new Element(tag) },
    localStorage: { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } },
    window: { addEventListener() {} }
  };
  const source = readFileSync(fileURLToPath(new URL("./templates-catalog.js", import.meta.url)), "utf8");
  runInNewContext(source, context, { timeout: 1000 });
  return { gallery, categories, elements, store };
}

test("six free and three new Business templates remain searchable", () => {
  const { gallery, elements } = setup();
  assert.equal(gallery.children.length, 9);
  assert.equal(elements["catalog-controls"].hidden, false);
  assert.match(elements["template-results-count"].textContent, /9 из 9/);
  assert.ok(gallery.children.every((card) => card.children[0]?.tag === "a"));
});

test("category, search, reset and favorites work together", () => {
  const { gallery, categories, elements, store } = setup();
  categories[4].fire("click"); // News
  assert.equal(gallery.children.filter((card) => !card.hidden).length, 4);
  elements["template-search"].value = "отсутствует";
  elements["template-search"].fire("input");
  assert.equal(elements["template-empty"].hidden, false);
  elements["template-reset"].fire("click");
  assert.equal(gallery.children.filter((card) => !card.hidden).length, 9);
  gallery.children[0].children[1].fire("click");
  assert.equal(JSON.parse(store["anons-studio:favorite-templates:v1"]).length, 1);
  elements["template-favorites-toggle"].fire("click");
  assert.equal(gallery.children.filter((card) => !card.hidden).length, 1);
  gallery.children[0].children[1].fire("click");
  assert.equal(gallery.children.filter((card) => !card.hidden).length, 0);
});

test("sorting alphabetically and restoring original order", () => {
  const { gallery, elements } = setup();
  const ids = () => gallery.children.map((item) => item.children[0].dataset.template);
  const initial = ids();
  elements["template-sort"].value = "name";
  elements["template-sort"].fire("change");
  assert.deepEqual(ids(), ["aurora", "bulletin", "business-brief", "business-pitch", "business-report", "editorial", "minimal", "pulse", "spotlight"]);
  elements["template-sort"].value = "default";
  elements["template-sort"].fire("change");
  assert.deepEqual(ids(), initial);
});
