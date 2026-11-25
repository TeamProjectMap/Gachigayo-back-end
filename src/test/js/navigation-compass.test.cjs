const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../../main/resources/static/js/navigation-compass.js');
const absolute=(alpha,beta=0,gamma=0)=>({absolute:true,alpha,beta,gamma});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
test('absolute compass resolves the four cardinal directions and portrait tilt',()=>{
 for(const [alpha,bearing] of [[0,0],[270,90],[180,180],[90,270]]) {
  close(C.heading(absolute(alpha)),bearing);close(C.heading(absolute(alpha,50)),bearing);
 }
});
test('screen top direction is corrected for landscape and legacy screen angles',()=>{
 close(C.heading(absolute(0),90),90);close(C.heading(absolute(0),270),270);
 close(C.heading(absolute(270),90),180);close(C.heading(absolute(0),-90),270);
 close(C.heading({webkitCompassHeading:350,webkitCompassAccuracy:10},90),80);
});
test('relative gyro and GPS heading alone never masquerade as a compass',()=>{
 assert.equal(C.heading({alpha:270,beta:0,gamma:0,absolute:false}),null);
 assert.equal(C.heading({heading:90,speed:5}),null);
 assert.equal(C.heading({alpha:270,beta:0,gamma:0}),null);
});
test('unusable, missing and nearly vertical readings preserve the dot',()=>{
 for(const event of [absolute(null),absolute(NaN),absolute(1,null),absolute(500),absolute(0,90),
  {webkitCompassHeading:-1},{webkitCompassHeading:90,webkitCompassAccuracy:-1},
  {webkitCompassHeading:90,webkitCompassAccuracy:50}, {webkitCompassHeading:90,webkitCompassAccuracy:NaN}])
  assert.equal(C.heading(event),null);
 close(C.heading({webkitCompassHeading:0,webkitCompassAccuracy:0}),0);
});
function fixture(permission) {
 const win=new EventTarget(),doc=new EventTarget(),orientation=new EventTarget();
 let values=[],statuses=[],pending=[],requests=0;
 Object.assign(doc,{hidden:false});Object.assign(orientation,{angle:0});
 Object.assign(win,{isSecureContext:true,document:doc,screen:{orientation},DeviceOrientationEvent:class{},
  setTimeout:fn=>(pending.push(fn),pending.length),clearTimeout:id=>{pending[id-1]=null}});
 if(permission) win.DeviceOrientationEvent.requestPermission=async()=>{requests++;return permission();};
 const compass=C.create(v=>values.push(v),s=>statuses.push(s),win);
 const emit=properties=>{const event=new Event('deviceorientation');Object.assign(event,properties);win.dispatchEvent(event);};
 return {win,doc,orientation,values,statuses,compass,emit,requests:()=>requests,expire:()=>pending.findLast(Boolean)?.()};
}
test('permission is requested only on enable and denial never breaks tracking',async()=>{
 let permission='denied';const f=fixture(()=>permission);f.compass.start();assert.equal(f.requests(),0);
 assert.equal(f.statuses.at(-1),'permission');await f.compass.enable();assert.equal(f.requests(),1);
 assert.equal(f.values.at(-1),null);assert.equal(f.statuses.at(-1),'denied');
 permission='granted';await f.compass.enable();f.emit({webkitCompassHeading:90,webkitCompassAccuracy:10});
 assert.equal(f.values.at(-1),90);assert.equal(f.statuses.at(-1),'active');
 f.compass.stop();f.emit({webkitCompassHeading:180});assert.equal(f.values.at(-1),null);
});
test('stale readings, hidden documents and page lifecycle discard old headings',()=>{
 const f=fixture();f.compass.start();f.emit(absolute(270));assert.equal(f.values.at(-1),90);
 f.emit({alpha:0,beta:0,gamma:0,absolute:false});assert.equal(f.values.at(-1),90);
 f.expire();assert.equal(f.values.at(-1),null);assert.equal(f.statuses.at(-1),'unavailable');
 f.emit(absolute(0));f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.values.at(-1),null);
 f.emit(absolute(270));assert.equal(f.values.at(-1),null);
 f.doc.hidden=false;f.doc.dispatchEvent(new Event('visibilitychange'));f.emit(absolute(180));assert.equal(f.values.at(-1),180);
 f.compass.stop();f.compass.start();f.emit(absolute(270));assert.equal(f.values.at(-1),90);
});
test('screen rotation recalculates the same physical orientation without a GPS update',()=>{
 const f=fixture();f.compass.start();f.emit(absolute(0));f.orientation.angle=90;
 f.orientation.dispatchEvent(new Event('change'));close(f.values.at(-1),90);
});
test('no sensor, insecure context and permission exceptions fall back safely',async()=>{
 for(const overrides of [{DeviceOrientationEvent:undefined},{isSecureContext:false}]) {
  const f=fixture();Object.assign(f.win,overrides);f.compass.start();assert.equal(f.values.at(-1),null);assert.equal(f.statuses.at(-1),'unsupported');
 }
 const f=fixture(()=>{throw new Error('blocked')});f.compass.start();await f.compass.enable();assert.equal(f.statuses.at(-1),'denied');
});
