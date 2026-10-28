/* Small local helpers: Firebase web configuration is data, never executable code. */
(function(scope){
  'use strict';
  const fields=new Set(['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId','databaseURL']);
  function parseFirebaseConfig(raw){
    const assignment=String(raw).match(/\bfirebaseConfig\s*=\s*/);
    let source=assignment?String(raw).slice(assignment.index+assignment[0].length).trim():String(raw).trim();
    if(!source.startsWith('{'))throw new Error('Očekuje se Firebase JSON objekt ili firebaseConfig iz konzole.');
    source=source.slice(1);const result={};
    while(true){
      source=source.replace(/^\s*(?:\/\/[^\n]*(?:\n|$)\s*)*/, '');
      if(source.startsWith('}'))break;
      const match=source.match(/^\s*(?:"([A-Za-z][A-Za-z0-9]*)"|([A-Za-z][A-Za-z0-9]*))\s*:\s*("(?:[^"\\]|\\.)*")\s*(,|})/);
      if(!match)throw new Error('Vrijednosti konfiguracije moraju biti tekst u dvostrukim navodnicima.');
      const key=match[1]||match[2];if(!fields.has(key)||Object.hasOwn(result,key))throw new Error('Nepoznato ili ponovljeno Firebase polje.');
      result[key]=JSON.parse(match[3]);source=source.slice(match[0].length);
      if(match[4]==='}')break;
    }
    if(!result.apiKey||!result.projectId)throw new Error('Nedostaju apiKey ili projectId.');
    return result;
  }
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderActivityItems(host,items){
    const doc=host.ownerDocument;host.replaceChildren();
    items.forEach(a=>{
      const row=doc.createElement('div'),body=doc.createElement('div'),meta=doc.createElement('div');
      row.style.cssText='padding:10px 0;border-bottom:1px solid var(--sage-line)';body.style.cssText='font-size:14px;color:var(--ink);line-height:1.4';meta.style.cssText='font-size:11.5px;color:var(--ink-soft);margin-top:2px';
      body.textContent=a.tekst||'';meta.textContent=(a.unio||'Netko')+' · '+new Date(a.ts).toLocaleString('hr-HR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});row.append(body,meta);host.append(row);
    });
  }
  const api={parseFirebaseConfig,escapeHtml,renderActivityItems};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.OpgSecurity=api;
})(typeof window==='undefined'?globalThis:window);
