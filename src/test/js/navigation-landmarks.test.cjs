const test=require('node:test'),assert=require('node:assert/strict');
const {nearby}=require('../../main/resources/static/js/navigation-landmarks.js');
const pathPoints=[{latitude:37.56,longitude:126.97},{latitude:37.56,longitude:126.972}];
const step={type:'WALKING',pathPoints},fix={latitude:37.56,longitude:126.971,accuracy:10};
const photo={id:1,title:'편의점',latitude:37.56,longitude:126.9711};
test('nearby landmark requires the current walking path and good GPS',()=>{
 assert.equal(nearby([photo],step,fix).id,1);
 assert.equal(nearby([photo],step,{...fix,accuracy:100}),null);
 assert.equal(nearby([photo],step,{...fix,latitude:37.57}),null);
 assert.equal(nearby([{...photo,latitude:37.561}],step,fix),null);
});
test('dismissed, distant and unlocated photos are not announced',()=>{
 assert.equal(nearby([photo],step,fix,[1]),null);
 assert.equal(nearby([{id:2,title:'no coordinates'}],step,fix),null);
 assert.equal(nearby([{...photo,longitude:126.973}],step,fix),null);
});
// 카카오 대중교통 경로에는 출발지→정류장 도보가 없어, 그 길을 걷는 동안 단계가 '버스'로 잡혀 있다
test('walk to the stop: transit step still shows a photo right next to you',()=>{
 const bus={type:'BUS',pathPoints};
 assert.equal(nearby([photo],bus,fix).id,1);
 assert.equal(nearby([photo],{type:'BUS'},fix).id,1);
 assert.equal(nearby([{...photo,longitude:126.9716}],bus,fix),null); // 약 53m
});
test('riding fast in a vehicle does not pop up photos',()=>{
 assert.equal(nearby([photo],{type:'BUS',pathPoints},{...fix,speed:12}),null);
 assert.equal(nearby([photo],step,{...fix,speed:12}),null);
});
