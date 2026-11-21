const {test} = require('node:test');
const assert = require('node:assert/strict');
const {forStep} = require('../../main/resources/static/js/navigation-cue.js');
const cue = guidance => forStep({type:'WALKING', guidance}).kind;

test('walking arrows follow Korean movement instructions', () => {
  for (const [guidance,kind] of [
    ['앞으로 쭉 가세요','straight'], ['150m 직진','straight'],
    ['편의점에서 오른쪽으로 도세요','right'], ['좌회전하세요','left'],
    ['왼쪽 대각선으로 이동하세요','slight-left'], ['오른쪽 대각선으로 가세요','slight-right'],
    ['유턴하세요','uturn'], ['횡단보도를 건너세요','crosswalk'],
    ['계단을 올라가세요','stairs-up'], ['계단을 내려가세요','stairs-down'],
  ]) assert.equal(cue(guidance),kind,guidance);
});
test('show the first action, not a later turn or a nearby landmark direction', () => {
  assert.equal(cue('150m 직진 후 우회전하세요'),'straight');
  assert.equal(cue('우회전 후 직진하세요'),'right');
  assert.equal(cue('왼쪽에 편의점이 있어요'),'walking');
  assert.equal(cue('우회전하지 말고 직진하세요'),'walking');
  assert.equal(cue('목적지까지 이동하세요'),'walking');
  assert.equal(forStep({guidance:'좌회전',easyGuidance:'앞으로 가세요'}).kind,'straight');
});
test('boarding, alighting and completion use the actual navigation state', () => {
  for (const type of ['BUS','SUBWAY']) {
    assert.equal(forStep({type,guidance:'우회전'}).kind,'board');
    assert.equal(forStep({type},{boarded:true}).kind,'alight');
  }
  assert.equal(forStep(undefined,{complete:true}).kind,'arrival');
  assert.equal(forStep(undefined).kind,'walking');
});
