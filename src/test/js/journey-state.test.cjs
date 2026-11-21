const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../../main/resources/static/js/journey-state.js');
const storage = () => { const values = new Map(); return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; };
const selection={selectedAt:100,destination:{id:'station'},route:{steps:[{},{}]}};
test('new routes ignore a previous route progress, including boarding',()=>{
 assert.deepEqual(state.progress(selection,{routeKey:'old',stepIndex:1,boarded:[1]}),{stepIndex:0,completed:false,boarded:[]});
});
test('resume clamps a saved index and preserves explicit boarding',()=>{
 assert.deepEqual(state.progress(selection,{routeKey:state.key(selection),stepIndex:99,boarded:[1,'2']}),{stepIndex:2,completed:true,boarded:[1]});
});
test('device preferences are account scoped and allow only booleans',()=>{
 const s=storage();s.setItem('gachigayo:device:7',JSON.stringify({voice:true,shareLocation:false}));
 assert.deepEqual(state.preferences(7,s),{shareLocation:false});
 assert.throws(()=>state.savePreference(7,'voice',true,s));
 state.savePreference(7,'shareLocation',false,s);
 assert.equal(state.preferences(7,s).shareLocation,false);assert.equal(state.preferences(8,s).shareLocation,true);
 assert.throws(()=>state.savePreference(7,'shareLocation','false',s));
 state.savePreference(7,'shareLocation',false,s);assert.equal(state.preferences(7,s).shareLocation,false);
});
test('broken device storage falls back to defaults',()=>{
 assert.deepEqual(state.preferences(7,{getItem:()=>{throw Error('denied')}}),{shareLocation:true});
});
test('logout removes journey and trip context while retaining per-account preferences',()=>{
 const s=storage();s.setItem('currentTripId','5');s.setItem('selectedRoute','{}');state.savePreference(7,'shareLocation',false,s);
 state.clear(s);assert.equal(s.getItem('currentTripId'),null);assert.equal(s.getItem('selectedRoute'),null);assert.equal(state.preferences(7,s).shareLocation,false);
});

test('home resume requires an actual recent navigation start for the same account',()=>{
 const now=100000000;
 const active={routeKey:state.key(selection),userId:7,stepIndex:0,startedAt:now-1000,updatedAt:now-500};
 assert.equal(state.canResume({...selection,navigationReady:true,userId:7},active,7,now),true);
 assert.equal(state.canResume({...selection,navigationReady:true}, {routeKey:state.key(selection),stepIndex:0},7,now),false);
 assert.equal(state.canResume({...selection,navigationReady:true},active,8,now),false);
 assert.equal(state.canResume({...selection,navigationReady:true},{...active,routeKey:'other'},7,now),false);
 assert.equal(state.canResume({...selection,navigationReady:true},{...active,completed:true},7,now),false);
 assert.equal(state.canResume({...selection,navigationReady:true},{...active,stepIndex:2},7,now),false);
 assert.equal(state.canResume({...selection,navigationReady:true},{...active,startedAt:1,updatedAt:now-7*60*60*1000},7,now),false);
});
