(() => { 'use strict';
const KEY='thiagoia-projects-v1', LEGACY='thiagoia-editor-html-v1';
const area=document.getElementById('projects'), message=document.getElementById('message');
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
const write=xs=>localStorage.setItem(KEY,JSON.stringify(xs));
function uuid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
// Importação única do último site salvo no Editor V1/V2.
try{ if(localStorage.getItem('thiagoia-legacy-imported-v1')!=='yes'){
 const old=localStorage.getItem(LEGACY);const xs=read();
 if(old && !xs.some(p=>p.html===old)){
  const title=new DOMParser().parseFromString(old,'text/html').title||'Projeto recuperado';
  xs.push({id:uuid(),name:title.slice(0,80),html:old,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});write(xs);
 }
 localStorage.setItem('thiagoia-legacy-imported-v1','yes');
}}catch{message.textContent='O armazenamento do navegador não está disponível.'}
function button(label,klass,onClick){const b=document.createElement('button');b.textContent=label;b.className=klass;b.type='button';b.addEventListener('click',onClick);return b}
function render(){area.replaceChildren();const xs=read().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 if(!xs.length){const p=document.createElement('p');p.className='empty';p.textContent='Nenhum projeto salvo. Gere um site e clique em Salvar neste navegador no editor.';area.append(p);return}
 xs.forEach(project=>{const card=document.createElement('article');card.className='card';const icon=document.createElement('div');icon.className='icon';icon.textContent='✦';const name=document.createElement('h2');name.textContent=project.name;const date=document.createElement('p');date.className='date';date.textContent='Atualizado em '+(new Date(project.updatedAt||project.createdAt)).toLocaleString('pt-BR');const controls=document.createElement('div');controls.className='controls';const open=document.createElement('a');open.className='open';open.textContent='Abrir editor';open.href='editor.html?project='+encodeURIComponent(project.id);controls.append(open);
 controls.append(button('Duplicar','secondary',()=>{try{const all=read();all.push({...project,id:uuid(),name:(project.name+' (cópia)').slice(0,80),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});write(all);render()}catch{message.textContent='Não foi possível duplicar (armazenamento cheio ou indisponível).'}}));
 controls.append(button('Excluir','danger',()=>{if(!confirm('Excluir permanentemente o projeto "'+project.name+'" deste navegador?'))return;try{write(read().filter(p=>p.id!==project.id));render()}catch{message.textContent='Não foi possível excluir.'}}));card.append(icon,name,date,controls);area.append(card)});
}render();
})();