import assert from "node:assert/strict";
import test from "node:test";
import {EMPTY_LOCK, withPin} from "@agent-plugins/workflows";
import {installedFrom} from "../dist/plugin-facts.js";

const source="a".repeat(64);
const selection="b".repeat(64);
const read={name:undefined,version:undefined,checksum:selection,skills:["run"],contentSource:{checksum:source,files:{"LICENSE":"c".repeat(64)}}};
const pin={plugin:"bare",version:"1.2.0",checksum:selection,contentSource:read.contentSource,adapter:"discovery",contractVersion:"1.0.0",mappingDigest:"d".repeat(64)};
const roots=[{path:"/bare",name:"bare",version:undefined}];
const declared=[{name:"bare",version:"^1.0.0",source:"github:example/bare",adapter:["discovery","implementation"]}];
const resolved=(lock,candidate=read)=>installedFrom({readPlugin:()=>({ok:true,value:candidate})},roots,{lock,onboarded:declared});

test("bare content dependencies keep their adopted version across shared-lock migration",()=>{
  const legacy=withPin(EMPTY_LOCK,pin);
  const shared=withPin(legacy,{...pin,adapter:"implementation"});
  assert.equal(legacy.lockVersion,1);
  assert.equal(shared.lockVersion,2);
  assert.equal(resolved(legacy).facts.get("bare").version,"1.2.0");
  assert.equal(resolved(shared).facts.get("bare").version,"1.2.0");
  const expanded={...read,checksum:"e".repeat(64),contentSource:{...read.contentSource,files:{...read.contentSource.files,"README.md":"f".repeat(64)}}};
  assert.equal(resolved(shared,expanded).facts.get("bare").version,"1.2.0");
  const changed={...read,contentSource:{...read.contentSource,checksum:"f".repeat(64)}};
  assert.equal(resolved(shared,changed).facts.get("bare").version,"1.0.0");
});
