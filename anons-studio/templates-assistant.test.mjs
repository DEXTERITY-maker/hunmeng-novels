import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function setup() {
  const events = {};
  const make = () => ({ value:"", textContent:"", href:"", dataset:{},
    addEventListener(type,handler){ this.handler = handler; },
    fire(){ this.handler?.(); },
    replaceChildren(element){ this.preview = element; }
  });
  const parts = Object.fromEntries(["template-assistant","assistant-purpose","assistant-mood",
    "assistant-result-title","assistant-result-reason","assistant-result-art","assistant-open"].map(id=>[id,make()]));
  parts["assistant-purpose"].value="update";
  parts["assistant-mood"].value="bold";
  const available = new Set(["aurora","editorial","spotlight","pulse","minimal","bulletin"]);
  const doc = {
    getElementById(id){return parts[id] || null;},
    querySelector(selector){
      const match=selector.match(/data-template="([a-z]+)"/);
      return match && available.has(match[1]) ? {cloneNode(){return {template:match[1]}}} : null;
    }
  };
  const script=readFileSync(new URL("./templates-assistant.js",import.meta.url),"utf8");
  runInNewContext(script,{document:doc,encodeURIComponent,Object});
  return parts;
}

test("assistant defaults to a real template and compatible preset",()=>{
  const parts=setup();
  assert.equal(parts["assistant-open"].href,"./editor.html?template=aurora&preset=update");
  assert.equal(parts["assistant-result-art"].preview.template,"aurora");
});

test("twelve purpose-and-mood combinations use allowlisted editor parameters",()=>{
  const parts=setup();
  const purpose=parts["assistant-purpose"];
  const mood=parts["assistant-mood"];
  const expected={
    update: ["minimal","aurora","editorial"],
    launch: ["minimal","spotlight","editorial"],
    event: ["bulletin","pulse","editorial"],
    notice: ["bulletin","spotlight","editorial"]
  };
  for(const [goal,templates] of Object.entries(expected)){
    purpose.value=goal;purpose.fire();
    for(const [index,style] of ["calm","bold","editorial"].entries()){
      mood.value=style;mood.fire();
      const selected=templates[index];
      assert.equal(parts["assistant-open"].href,"./editor.html?template="+selected+"&preset="+goal);
      assert.equal(parts["assistant-result-art"].preview.template,selected);
      assert.match(parts["assistant-result-title"].textContent,new RegExp(selected,"i"));
    }
  }
});

test("unrecognized selections fall back to stable safe defaults",()=>{
  const parts=setup();
  parts["assistant-purpose"].value="<unknown>";
  parts["assistant-mood"].value="n/a";
  parts["assistant-purpose"].fire();
  assert.equal(parts["assistant-open"].href,"./editor.html?template=aurora&preset=update");
});
