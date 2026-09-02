import React from 'react';
export function EmployeeBot({size=120,className='',bodyColor='#2563eb',eyeColor='#fff',state='idle'}) {
 return React.createElement('svg',{viewBox:'0 0 120 120',width:size,height:size,className:'employee-bot '+className,role:'img','aria-label':'Employee: '+state},
 React.createElement('rect',{x:15,y:25,width:90,height:78,rx:24,fill:bodyColor}),
 React.createElement('rect',{x:40,y:48,width:9,height:22,rx:4.5,fill:eyeColor}),
 React.createElement('rect',{x:71,y:48,width:9,height:22,rx:4.5,fill:eyeColor}));
}
