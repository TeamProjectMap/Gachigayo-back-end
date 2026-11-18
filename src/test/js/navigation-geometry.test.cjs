const test = require('node:test');
const assert = require('node:assert/strict');
const { valid, distance, match } = require('../../main/resources/static/js/navigation-geometry.js');
const p = (longitude, latitude = 37) => ({ longitude, latitude });

test('rejects missing, blank and out-of-range coordinates', () => {
    assert.ok(!valid({ latitude: '', longitude: '' }));
    assert.ok(!valid({ latitude: null, longitude: 127 }));
    assert.ok(!valid(p(181))); assert.ok(valid(p(0, 0)));
    assert.equal(distance(p(127), null), Infinity);
});
test('distance is measured in metres', () => {
    assert.equal(distance(p(127), p(127)), 0);
    assert.ok(distance(p(127, 37), p(127, 37.001)) > 110);
    assert.ok(distance(p(127, 37), p(127, 37.001)) < 112);
});
test('progress is based on segment length, not the number of vertices', () => {
    const result = match(p(127.005), [p(127), p(127.001), p(127.01)]);
    assert.ok(Math.abs(result.progress - .5) < .001);
    assert.ok(result.distance < .01);
    assert.ok(result.remaining > 440 && result.remaining < 450);
});
test('off-route GPS does not look like progress at the destination', () => {
    const result = match(p(127.005, 37.003), [p(127), p(127.01)]);
    assert.ok(result.distance > 330); assert.ok(result.progress < .75);
});
test('zero-length and missing geometry do not generate NaN or phantom coordinates', () => {
    assert.equal(match(p(127), []).distance, Infinity);
    const result = match(p(127), [p(127), p(127)]);
    assert.equal(result.remaining, 0); assert.equal(result.progress, 0);
    assert.ok(Number.isFinite(result.distance));
});
test('remaining journey accounts for movement within the current step',()=>{const {summarize}=require('../../main/resources/static/js/navigation-geometry.js');const steps=[{distance:200,time:120},{distance:1000,time:300},{distance:100,time:60}];const halfway=summarize(steps,0,.5);assert.equal(halfway.remainingDistance,1200);assert.equal(halfway.remainingTime,420);assert.ok(halfway.progress>0);const transit=summarize(steps,1,.5);assert.equal(transit.remainingDistance,600);assert.equal(transit.remainingTime,210);});
test('completed and zero-distance journeys produce finite progress and zero remaining values',()=>{const {summarize}=require('../../main/resources/static/js/navigation-geometry.js');assert.deepEqual(summarize([{distance:100,time:60}],1),{remainingTime:0,remainingDistance:0,progress:1});assert.equal(summarize([],0).progress,1);assert.equal(summarize([{distance:-1,time:-2}],0).remainingTime,0);});
