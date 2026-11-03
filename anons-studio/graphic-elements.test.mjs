import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const moduleText=await readFile(join(dirname(fileURLToPath(import.meta.url)),"graphic-elements.js"),"utf8");
const sandbox={};
sandbox.globalThis=sandbox;
runInNewContext(moduleText,sandbox);
const G=sandbox.AnonsGraphics;

test("shared path library is a fixed set of 12 safe icons",()=>{
  assert.equal(Object.keys(G.paths).length,12);
  for(const [kind,path] of Object.entries(G.paths)){
    assert.ok(/^[MLCQAZ0-9 .-]+$/i.test(path),kind+" must contain only safe SVG path commands");
    assert.ok(typeof G.labels[kind]==="string");
  }
});

test("graphics geometry matches normalized percent coordinates across export sizes",()=>{
  const item=G.normalizeOne({id:"demo",kind:"diamond",x:25,y:60,size:20,rotation:45,
    opacity:75,color:"#AABBCC"},0);
  for(const [width,height] of [[1080,1350],[1080,1080],[1080,1920]]){
    const actual=G.frame(item,width,height);
    assert.equal(actual.x,width*.25);
    assert.equal(actual.y,height*.60);
    assert.equal(actual.size,Math.min(width,height)*.20);
    assert.equal(actual.rotation,45);
    assert.equal(actual.opacity,.75);
    assert.equal(actual.color,"#aabbcc");
    assert.equal(actual.path,G.paths.diamond);
  }
});

test("untrusted projects are bounded, sanitized and cannot inject paths",()=>{
  const list=Array.from({length:22},(_,i)=>({id:"same",kind:i?"not-a-shape":"star",
    x:Infinity,y:-999,size:1000,rotation:999,opacity:-999,color:"url(javascript:1)"}));
  const sanitized=JSON.parse(JSON.stringify(G.normalizeElements(list)));
  assert.equal(sanitized.length,12);
  assert.equal(new Set(sanitized.map(e=>e.id)).size,12);
  assert.ok(sanitized.every(e=>G.paths[e.kind]&&e.x===50&&e.y===0&&e.size===35
    &&e.rotation===180&&e.opacity===20&&e.color==="#c2a1ff"));
});
