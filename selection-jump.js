(function(){
  const preview=document.querySelector('#preview');
  const codeEditor=document.querySelector('#code-editor');
  const workspace=document.querySelector('#workspace');
  if(!preview||!codeEditor||!workspace)return;

  window.addEventListener('message',event=>{
    const data=event.data;
    if(!data||data.type!=='page-studio-select')return;
    const source=codeEditor.value||'';
    const offset=findSelectionOffset(source,data);
    if(offset<0){setStatus(`Selected ${describe(data)}, but its source location could not be matched.` ,true);return;}

    switchToSplit();
    const lineStart=source.lastIndexOf('\n',offset-1)+1;
    const lineEnd=source.indexOf('\n',offset);
    const selectionEnd=lineEnd===-1?Math.min(source.length,offset+Math.max(1,(data.text||data.tag||'').length)):lineEnd;
    codeEditor.focus({preventScroll:true});
    codeEditor.setSelectionRange(lineStart,selectionEnd);
    scrollTextareaToOffset(codeEditor,source,lineStart);
    setStatus(`Selected ${describe(data)} in Live view and jumped to its HTML.`);
  });

  function switchToSplit(){
    document.querySelectorAll('[data-view]').forEach(button=>{
      const active=button.dataset.view==='split';
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    workspace.className='workspace view-split';
  }

  function findSelectionOffset(source,data){
    const id=String(data.id||'').trim();
    if(id){
      const escaped=escapeRegExp(id);
      const idMatch=new RegExp(`<${data.tag||'[a-zA-Z][^\\s/>]*'}\\b[^>]*\\bid\\s*=\\s*(["'])${escaped}\\1`,'i').exec(source);
      if(idMatch)return idMatch.index;
    }

    const text=normalize(data.text||'');
    if(text){
      const textIndex=source.toLowerCase().indexOf(text.toLowerCase());
      if(textIndex>=0){
        const tagStart=source.lastIndexOf('<',textIndex);
        if(tagStart>=0)return tagStart;
        return textIndex;
      }
    }

    const tag=String(data.tag||'').toLowerCase();
    if(tag){
      const tagMatch=new RegExp(`<${escapeRegExp(tag)}\\b`,'i').exec(source);
      if(tagMatch)return tagMatch.index;
    }
    return -1;
  }

  function scrollTextareaToOffset(textarea,source,offset){
    const before=source.slice(0,offset);
    const line=before.split('\n').length-1;
    const computed=getComputedStyle(textarea);
    const lineHeight=parseFloat(computed.lineHeight)||20;
    textarea.scrollTop=Math.max(0,line*lineHeight-textarea.clientHeight*0.35);
  }

  function setStatus(message,isError=false){
    const status=document.querySelector('#status');
    if(!status)return;
    status.textContent=message;
    status.classList.toggle('error',Boolean(isError));
  }

  function describe(data){
    if(data.id)return `${data.tag||'element'}#${data.id}`;
    if(data.text)return `${data.tag||'element'} “${String(data.text).slice(0,50)}”`;
    return data.tag||'element';
  }

  function normalize(value){return String(value).replace(/\s+/g,' ').trim();}
  function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
})();
