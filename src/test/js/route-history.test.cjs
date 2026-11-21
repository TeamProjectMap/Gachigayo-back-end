const {test}=require('node:test');
const assert=require('node:assert/strict');
const H=require('../../main/resources/static/js/route-history.js');
const start={latitude:37.55,longitude:126.85},end={latitude:37.56,longitude:126.86};
const route=(name='5호선',stops=['발산','우장산'])=>({totalTime:1000,fare:1500,steps:[{type:'WALKING'}, {type:'SUBWAY',vehicles:[{name}],stops}]});
test('changing time, fare or voice guidance does not change route identity',async()=>{
 const a=route(),b={...route(),totalTime:1800,fare:1700};b.steps[1].easyGuidance='지하철에 타요';
 assert.match(await H.key(a),/^v1:[a-f0-9]{64}$/);assert.equal(await H.key(a),await H.key(b));
});
test('opposite direction, line, boarding stop and transfer order are distinct',async()=>{
 const a=route();for(const b of [route('5호선',['우장산','발산']),route('9호선'),route('5호선',['화곡','우장산'])])assert.notEqual(await H.key(a),await H.key(b));
 const two=route();two.steps.push({type:'BUS',vehicles:[{name:'6628'}],stops:['A','B']});
 const reverse={...two,steps:[...two.steps].reverse()};assert.notEqual(await H.key(two),await H.key(reverse));
});
test('matching requires both nearby endpoints, not just the same vehicle',async()=>{
 const signature=await H.key(route()),record={eventMessage:signature+'|37.56|126.86',lat:37.55,lng:126.85};
 assert.ok(H.matches(record,signature,start,end));
 assert.ok(!H.matches(record,signature,{latitude:37.6,longitude:126.85},end));
 assert.ok(!H.matches(record,signature,start,{latitude:37.6,longitude:126.86}));
 assert.ok(!H.matches({eventMessage:signature+'||',lat:null,lng:null},signature,start,end));
});
test('walking paths differ; geometry-free routes are never claimed as familiar',async()=>{
 const walk={steps:[{pathPoints:[start,end]}]},other={steps:[{pathPoints:[start,{latitude:37.551,longitude:126.9},end]}]};
 assert.notEqual(await H.key(walk),await H.key(other));assert.equal(await H.key({steps:[{type:'WALKING'}]}),'');
 assert.equal(await H.key({steps:[{type:'BUS',vehicles:[{name:'1'}],stops:[]}]}),'');
});
test('latest completed candidate is promoted once; all other cards retain order and data',()=>{
 const a=route(),b=route('9호선'),c=route('2호선');const cards=[{route:a,label:'추천'},{route:b,label:'빠름'}];
 assert.deepEqual(H.prioritize(cards,[a,b],new Map()),cards);
 const result=H.prioritize(cards,[a,b,c],new Map([[a,2],[b,0]]));
 assert.equal(result[0].label,'가봤던 길');assert.equal(result[0].route,b);assert.equal(result[1],cards[0]);assert.equal(result.length,2);
 const extra=H.prioritize(cards,[a,b,c],new Map([[c,0]]));assert.equal(extra.length,3);assert.deepEqual(extra.slice(1),cards);
});
