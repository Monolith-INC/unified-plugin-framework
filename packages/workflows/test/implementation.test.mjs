import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {IMPLEMENTATION_OPERATIONS, superpowersImplementationAdapter as adapter, renderSkill, pinFor} from "../dist/index.js";

const source=new URL("../../../plugins/unified-plugin-framework/",import.meta.url);
const lock=JSON.parse(readFileSync(new URL("onboarded.lock.json",source),"utf8"));
const template=(op)=>readFileSync(new URL(`skills/${op}/SKILL.md`,source),"utf8");

test("implementation assembles reviewed guidance without invoking native conductors",()=>{
  assert.equal(Object.isFrozen(adapter),true);
  assert.deepEqual(Object.keys(adapter.fulfil),IMPLEMENTATION_OPERATIONS);
  assert.ok(pinFor(lock,"superpowers","discovery"));
  assert.ok(pinFor(lock,"superpowers","implementation"));
  IMPLEMENTATION_OPERATIONS.forEach((op)=>{
    assert.doesNotMatch(template(op),/superpowers|Azure|Linear|Jira|Confluence/);
    const result=renderSkill(template(op),adapter,op,lock);
    assert.equal(result.ok,true,result.message);
    assert.match(result.text,/reviewed content excerpts/);
    assert.match(result.text,/Evidence|evidence/);
    assert.doesNotMatch(result.text,/\{\{|sdd-workspace|using-git-worktrees|finishing-a-development-branch|scripts\/task-start/);
    assert.doesNotMatch(result.text,/Project operations supply reads, hierarchy changes and publication/);
  });
});

test("missing reviewed execution content cannot be silently released",()=>{
  const changed={...adapter,contentViews:adapter.contentViews.filter((view)=>view.skill!=="executing-plans")};
  const result=renderSkill(template("implement-work"),changed,"implement-work",lock);
  assert.equal(result.ok,false);
  assert.match(result.message,/content view is incomplete/);
});

test("the public contract preserves project authority and evidence-based resume/review",()=>{
  const work=template("implement-work");
  const verify=template("implement-verify");
  assert.match(work,/historical session approvals do not grant new permission/);
  assert.match(work,/first unfinished authorized task/);
  assert.match(work,/continuity-checkpoint/);
  assert.match(work,/resolve an uncertain write before replaying it/i);
  assert.match(verify,/review-task.*review-story.*review-feature/);
  assert.match(verify,/Reuse an already completed review of the same unchanged scope/);
  assert.match(verify,/publication.*merged|merged.*ticket done/);
});
