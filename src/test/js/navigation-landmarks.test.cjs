const test=require('node:test'),assert=require('node:assert/strict');
const {nearby}=require('../../main/resources/static/js/navigation-landmarks.js');
const pathPoints=[{latitude:37.56,longitude:126.97},{latitude:37.56,longitude:126.972}];
const step={type:'WALKING',pathPoints},fix={latitude:37.56,longitude:126.971,accuracy:10};
const photo={id:1,title:'편의점',latitude:37.56,longitude:126.9711};
test('nearby landmark requires the current walking path and good GPS',()=>{
 assert.equal(nearby([photo],step,fix).id,1);
 assert.equal(nearby([photo],{...step,type:'SUBWAY'},fix),null);
 assert.equal(nearby([photo],step,{...fix,accuracy:100}),null);
 assert.equal(nearby([photo],step,{...fix,latitude:37.57}),null);
 assert.equal(nearby([{...photo,latitude:37.561}],step,fix),null);
});
test('dismissed, distant and unlocated photos are not announced',()=>{
 assert.equal(nearby([photo],step,fix,[1]),null);
 assert.equal(nearby([{id:2,title:'no coordinates'}],step,fix),null);
 assert.equal(nearby([{...photo,longitude:126.973}],step,fix),null);
});
