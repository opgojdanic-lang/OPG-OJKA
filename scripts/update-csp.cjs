// Refresh after changing the inline application script. No secrets or data are printed.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const file=path.resolve(__dirname,'../index.html');let html=fs.readFileSync(file,'utf8');
const hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!(/\bsrc\s*=/.test(m[1]))).map(m=>"'sha256-"+createHash('sha256').update(m[2]).digest('base64')+"'");
const policy="script-src 'self' "+hashes.join(' ')+" https://www.gstatic.com/firebasejs/10.12.2/ https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js; base-uri 'self'; form-action 'self'; object-src 'none'";
const meta='<meta http-equiv="Content-Security-Policy" content="'+policy+'">';
if(/<meta http-equiv="Content-Security-Policy"[^>]*>/.test(html))html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,meta);else html=html.replace('<meta charset="UTF-8">','<meta charset="UTF-8">\n'+meta);
fs.writeFileSync(file,html);console.log('Updated CSP for '+hashes.length+' inline application script(s)');
