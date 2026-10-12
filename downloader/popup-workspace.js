(() => {
  document.addEventListener('DOMContentLoaded',()=>{
    for(const button of document.querySelectorAll('[data-panel-workspace]'))button.onclick=()=>{
      const create=button.dataset.panelWorkspace==='create';
      document.getElementById('panel-download').hidden=create;
      document.getElementById('panel-create').hidden=!create;
      for(const tab of document.querySelectorAll('[data-panel-workspace]'))tab.setAttribute('aria-selected',String(tab===button));
    };
    document.getElementById('open-download-workspace').onclick=()=>chrome.tabs.create({url:'http://127.0.0.1:5005/studio/#workspace=download'});
  });
})();
