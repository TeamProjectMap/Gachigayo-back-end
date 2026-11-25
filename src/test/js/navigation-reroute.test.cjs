const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../../main/resources/static/js/navigation-reroute.js');
const sample=(now,overrides={})=>({now,accuracy:10,distance:100,active:true,...overrides});
test('requires persistent accurate off-route fixes, not a single GPS jump',()=>{
 const d=R.detector();assert.equal(d.observe(sample(0)),false);assert.equal(d.observe(sample(5000)),false);assert.equal(d.observe(sample(10000)),true);
});
test('rejoining, poor accuracy, invalid distance and transit reset the evidence',()=>{
 for(const change of [{distance:30},{accuracy:100},{accuracy:NaN},{distance:Infinity},{active:false}]){
  const d=R.detector();d.observe(sample(0));d.observe(sample(5000));assert.equal(d.observe(sample(6000,change)),false);
  assert.equal(d.observe(sample(10000)),false);
 }
});
test('duplicate fixes and long background gaps cannot instantly trigger rerouting',()=>{
 const d=R.detector();d.observe(sample(0));for(let i=0;i<10;i++)assert.equal(d.observe(sample(0)),false);
 assert.equal(d.observe(sample(50000)),false);assert.equal(d.observe(sample(55000)),false);assert.equal(d.observe(sample(60000)),true);
});
test('requests are throttled across routes and can retry after failure',()=>{
 const d=R.detector();d.requested(0);d.observe(sample(1000));d.observe(sample(6000));assert.equal(d.observe(sample(11000)),false);
 assert.equal(d.observe(sample(20000)),false);d.observe(sample(30000));d.observe(sample(40000));assert.equal(d.observe(sample(45000)),true);
});
const step=(name='5호선')=>({type:'SUBWAY',vehicles:[{name}]});
const route=(name,time,transfers=0)=>({steps:[{type:'WALKING'},step(name)],totalTime:time,transfers});
test('prefer the remaining transit line and do not mutate search candidate order',()=>{
 const a=route('9호선',100),b=route('5호선',400),response={publicTransit:{available:true,routes:[a,b]}};
 assert.equal(R.choose(response,{mode:'PUBLIC_TRANSIT'},[step()]).route,b);assert.deepEqual(response.publicTransit.routes,[a,b]);
});
test('walking journeys and final walks keep walking; failed data preserves old journey',()=>{
 const walking={available:true,steps:[{type:'WALKING'}]},r={walking,publicTransit:{available:true,routes:[route('5호선',100)]}};
 assert.equal(R.choose(r,{mode:'WALKING'},[{}]).mode,'WALKING');
 assert.equal(R.choose(r,{mode:'PUBLIC_TRANSIT'},[{type:'WALKING'}]).mode,'WALKING');
 assert.equal(R.choose({walking:{available:false}},{mode:'WALKING'},[{}]),null);
 assert.equal(R.choose({publicTransit:{available:true,routes:[{steps:[]}]}},{mode:'PUBLIC_TRANSIT'},[step()]),null);
});
