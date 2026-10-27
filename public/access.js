(()=>{'use strict';
/* Convenience gate only. GitHub Pages and its public assets remain accessible. */
const EXPECTED='7a2f8517d043cc01d0d90bb92a3ae27cdb0c71f77269b4401ca01aab9f2d4f2c';
const STORAGE='ppcc2026.access.v1';
const root=document.getElementById('access-gate');
const form=document.getElementById('access-form');
const field=document.getElementById('access-code');
const error=document.getElementById('access-error');
let initialized=false;
function showError(message){error.textContent=message;error.hidden=false;}
function loadApp(){
 if(initialized)return;initialized=true;
 document.documentElement.classList.add('is-unlocked');
 root.hidden=true;
 const data=document.createElement('script');
 data.src='./data.js';
 data.onload=()=>{
  const app=document.createElement('script');
  app.src='./app.js';
  app.onerror=()=>showError('Could not load the companion. Please reload.');
  document.body.appendChild(app);
 };
 data.onerror=()=>showError('Could not load the schedule. Please reload.');
 document.body.appendChild(data);
}
window.PPCCAccess={lock(){try{localStorage.removeItem(STORAGE);}catch{}location.reload();}};
try{if(localStorage.getItem(STORAGE)===EXPECTED){loadApp();return;}}catch{}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 const raw=field.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!raw){showError('Enter the access code.');return;}
 if(!crypto.subtle){showError('A secure HTTPS connection is required.');return;}
 const button=form.querySelector('button[type="submit"]');
 button.disabled=true;error.hidden=true;
 try{
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  const hex=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  if(hex!==EXPECTED){showError('Incorrect code. Check the code and try again.');field.select();return;}
  try{localStorage.setItem(STORAGE,EXPECTED);}catch{}
  field.value='';
  loadApp();
 }catch{showError('Unable to verify the code. Try again.');}
 finally{button.disabled=false;}
});
field.focus();
})();
