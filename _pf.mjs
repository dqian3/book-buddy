import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1280,height:800} });
await p.goto('http://localhost:5184/');
await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.getByText('射雕英雄传',{exact:false}).first().click();
await p.waitForSelector('[data-testid="reader"]');
await p.getByRole('button',{name:'Contents'}).first().click();
await p.getByText('第一回',{exact:false}).first().click();
await p.waitForTimeout(400);
const open = async (name) => {
  await p.evaluate(()=>window.__prof=[]);
  await p.getByRole('button',{name}).first().click();
  await p.waitForTimeout(900); // include any deferred voice render
  const prof = await p.evaluate(()=>window.__prof);
  const sum = {};
  for(const [id,phase,a] of prof){ sum[id+'/'+phase]=(sum[id+'/'+phase]||0)+a; }
  console.log(name, '=>', JSON.stringify(sum), 'commits:', prof.length);
  await p.getByRole('button',{name:'Collapse panel'}).first().click().catch(()=>{});
  await p.waitForTimeout(200);
};
await open('Saved words');
await open('Settings');
await b.close();
