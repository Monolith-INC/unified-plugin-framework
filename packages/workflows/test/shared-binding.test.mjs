import assert from "node:assert/strict";
import test from "node:test";
import { readOnboardedPlugins, UPF_EXTENSION } from "@agent-plugins/core";
import { bindingPins, checkAdapterReadiness, checkPluginBinding, EMPTY_LOCK, mappingDigest, parseLock, pinFor, sourceMatches, withPin } from "../dist/index.js";

const digest = "a".repeat(64);
const adapter = (workflow) => ({ workflow, contractVersion: "1.0.0", composition: "one-of", fulfil: { run: [{ plugin: "shared", skill: "run" }] }, catalog: [], bareSkillPlugins: [], knowledgeStores: [] });
const discovery = adapter("discovery");
const implementation = adapter("implementation");
const pin = (selected, overrides={}) => ({plugin:"shared",version:"1.0.0",checksum:digest,adapter:selected.workflow,contractVersion:selected.contractVersion,mappingDigest:mappingDigest(selected),...overrides});
const found = {version:"1.0.0",checksum:digest,skills:["run"]};
const declarations = [{name:"shared",version:"^1.0.0",source:"github:example/shared",adapter:["discovery","implementation"]}];
const facts = (selected,lock,installed=found) => ({adapter:selected,onboarded:declarations,lock,installed:new Map([["shared",installed]]),projectStore:"knowledge",pluginStores:new Map()});

test("one declaration and source retain independently verified workflow mappings",()=>{
  const read=readOnboardedPlugins({[UPF_EXTENSION]:{onboardedPlugins:declarations}});
  assert.deepEqual(read.diagnostics,[]);
  const legacy=withPin(EMPTY_LOCK,pin(discovery));
  assert.equal(legacy.lockVersion,1);
  assert.deepEqual(parseLock(legacy),{ok:true,lock:legacy});
  const shared=withPin(legacy,pin(implementation));
  assert.equal(shared.lockVersion,2);
  assert.equal(shared.plugins.length,1);
  assert.equal(shared.plugins[0].bindings.length,2);
  assert.deepEqual(parseLock(shared),{ok:true,lock:shared});
  assert.deepEqual(checkAdapterReadiness(facts(discovery,shared)),{status:"ready"});
  assert.deepEqual(checkAdapterReadiness(facts(implementation,shared)),{status:"ready"});
  const repinned=withPin(shared,pin(implementation,{mappingDigest:"b".repeat(64)}));
  assert.deepEqual(pinFor(repinned,"shared","discovery"),pinFor(shared,"shared","discovery"));
  assert.equal(checkAdapterReadiness(facts(implementation,repinned)).status,"not-ready");
});

test("a replacement release cannot inherit another workflow's mapping approval",()=>{
  const shared=withPin(withPin(EMPTY_LOCK,pin(discovery)),pin(implementation));
  const replaced=withPin(shared,pin(implementation,{version:"1.1.0",checksum:"b".repeat(64)}));
  assert.equal(pinFor(replaced,"shared","discovery"),undefined);
  assert.equal(checkAdapterReadiness(facts(discovery,replaced,{...found,version:"1.1.0",checksum:"b".repeat(64)})).status,"not-ready");
});

test("content coverage can grow without changing shared source identity",()=>{
  const content={...found,checksum:"b".repeat(64),contentSource:{checksum:digest,files:{"LICENSE":"c".repeat(64)}}};
  const shared=withPin(withPin(EMPTY_LOCK,pin(discovery)),pin(implementation,{checksum:content.checksum,contentSource:content.contentSource}));
  assert.equal(shared.plugins[0].checksum,digest);
  assert.equal(sourceMatches(pinFor(shared,"shared","discovery"),content),true);
  const tampered={...content,contentSource:{...content.contentSource,files:{"LICENSE":"d".repeat(64)}}};
  assert.equal(checkPluginBinding(facts(discovery,shared,tampered)).status,"not-ready");
  assert.equal(bindingPins(shared.plugins[0]).length,2);
});

test("shared schemas reject conflicting, duplicate and unsupported bindings",()=>{
  const shared=withPin(withPin(EMPTY_LOCK,pin(discovery)),pin(implementation));
  const entry=shared.plugins[0];
  assert.equal(parseLock({...shared,lockVersion:3}).ok,false);
  assert.equal(parseLock({...shared,plugins:[entry,entry]}).ok,false);
  assert.equal(parseLock({...shared,plugins:[{...entry,bindings:[...entry.bindings,entry.bindings[0]]}]}).ok,false);
  assert.equal(parseLock({...shared,plugins:[{...entry,bindings:entry.bindings.map((b,i)=>({...b,files:{"LICENSE":String(i).repeat(64)}}))}]}).ok,false);
  assert.notEqual(readOnboardedPlugins({[UPF_EXTENSION]:{onboardedPlugins:[{...declarations[0],adapter:["discovery","discovery"]}]}}).diagnostics.length,0);
});
