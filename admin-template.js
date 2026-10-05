// Download controls only: uploads, drafts and pricing stay untouched.
(() => {
 const button=document.getElementById('downloadTemplate');
 const menu=document.getElementById('templateDownloads');
 const container=document.getElementById('templateDownloadControl');
 const links=[...menu.querySelectorAll('a')];
 function close(restoreFocus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(restoreFocus)button.focus();}
 function open(){menu.hidden=false;button.setAttribute('aria-expanded','true');}
 button.addEventListener('click',()=>{if(menu.hidden)open();else close();});
 button.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();open();links[0].focus();}else if(event.key==='Escape'){close(true);}});
 menu.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close(true);}
  else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const index=links.indexOf(document.activeElement);
   links[event.key==='Home'?0:event.key==='End'?links.length-1:(index+(event.key==='ArrowDown'?1:-1)+links.length)%links.length].focus();
  }
 });
 links.forEach(link=>link.addEventListener('click',()=>close(true)));
 document.addEventListener('click',event=>{if(!container.contains(event.target))close();});
 document.addEventListener('focusin',event=>{if(!container.contains(event.target))close();});
 document.getElementById('gateLogout').addEventListener('click',()=>close());
})();
