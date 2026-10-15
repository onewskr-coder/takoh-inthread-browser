/* Reorganize existing controls without replacing handlers or saved settings. */
(()=>{
  const root=document.getElementById('settings-workspace');
  if(!root||root.dataset.organized)return;
  root.dataset.organized='true';
  const byId=id=>document.getElementById(id);
  const sections=[...root.children].filter(n=>n.tagName==='SECTION');
  const ai=byId('ai-provider').closest('section'),kie=byId('kie-settings-section');
  const heading=root.querySelector('.workspace-heading');
  heading.querySelector('h1').textContent='연결 및 설정';
  heading.querySelector('p').textContent='사용할 서비스 하나를 선택하고 키를 등록하세요. 저장된 키와 로그인은 그대로 유지됩니다.';
  const nav=document.createElement('div');nav.className='settings-nav';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','설정 분류');
  heading.after(nav);
  const groups={};
  for(const [key,label] of [['ai','AI 연결'],['search','콘텐츠 검색·제휴'],['usage','사용량·등록 현황']]){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.id='settings-tab-'+key;button.setAttribute('role','tab');button.setAttribute('aria-controls','settings-panel-'+key);
    const panel=document.createElement('div');panel.id='settings-panel-'+key;panel.className='settings-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);root.append(panel);groups[key]={button,panel};nav.append(button);
    button.onclick=()=>{for(const [id,g]of Object.entries(groups)){g.panel.hidden=id!==key;g.button.setAttribute('aria-selected',String(id===key));}};
    button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const list=[...nav.children],i=list.indexOf(button),next=e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[next].click();list[next].focus();};
  }
  for(const section of sections){
    const title=section.querySelector('h2')?.textContent||'';
    groups[section===ai||section===kie?'ai':section.id==='youtube-settings-section'?'search':/사용량|등록 현황/.test(title)?'usage':'search'].panel.append(section);
  }
  groups.ai.panel.prepend(ai);
  const step=(host,title)=>{const h=host.querySelector('h2');if(h)h.textContent=title;};
  step(ai,'1. 사용할 AI 선택');step(kie,'2. KIE 키 등록');
  const modelBox=document.createElement('section');modelBox.className='settings-model-step';modelBox.innerHTML='<h2>3. 모델 선택</h2><p class="hint">모델 목록을 불러온 뒤 사용할 모델을 선택하세요. 생성 실행은 제작 화면에서 진행합니다.</p>';
  groups.ai.panel.append(modelBox);
  const modelLabel=byId('model-choice').closest('label');modelBox.append(byId('refresh-models'),modelLabel,byId('kie-inspect-model'),byId('kie-model-status'));
  const keyBox=document.createElement('div');keyBox.className='settings-key-step';keyBox.innerHTML='<h3>2. API 키 등록</h3>';ai.append(keyBox);keyBox.append(byId('api-key-label'),byId('save-ai-key'));
  byId('key').placeholder='API 키를 붙여넣으세요';byId('save-ai-key').textContent='키 저장';byId('kie-key').placeholder='KIE API 키를 붙여넣으세요';byId('kie-save-key').textContent='KIE 키 저장';byId('refresh-models').textContent='모델 목록 불러오기';byId('kie-inspect-model').textContent='선택 모델의 지원 기능·요금 확인';
  const extra=document.createElement('details');extra.className='settings-extra';extra.innerHTML='<summary>크레딧 조회·등록 상태·키 삭제</summary>';kie.append(extra);extra.append(byId('kie-credit'),byId('kie-credit-status'),byId('kie-refresh-status'),byId('kie-clear-key'));
  const translation=document.createElement('details');translation.className='settings-extra';translation.innerHTML='<summary>KIE 문장 번역 도구</summary>';kie.append(translation);translation.append(byId('kie-translate-input').closest('label'),byId('kie-translate'),byId('kie-translation-result'));
  // The model workflow now appears immediately below key registration.
  for(const p of [...kie.querySelectorAll(':scope > p.hint')])if(p.textContent.includes('→'))p.remove();
  const custom=ai.querySelector('.settings-custom-model-drawer');if(custom)modelBox.append(custom);
  const guide=document.createElement('p');guide.className='settings-connection-guide';ai.querySelector('h2').after(guide);
  const update=()=>{const provider=byId('ai-provider').value,isKie=provider==='kie_api',cli=provider.endsWith('_cli');kie.hidden=!isKie;keyBox.hidden=isKie||cli;byId('kie-inspect-model').hidden=!isKie;byId('kie-model-status').hidden=!isKie;guide.textContent=cli?'계정 로그인 방식입니다. API 키 없이 아래 로그인·연결 확인 버튼을 사용하세요.':'API 키를 저장하고 아래에서 모델을 선택하면 연결 준비가 끝납니다.';modelBox.querySelector('h2').textContent=cli?'2. 모델 선택':'3. 모델 선택';if(custom)custom.hidden=isKie;};

  const picker=document.createElement('section');picker.className='settings-provider-picker';picker.innerHTML='<h2>어떤 AI를 사용할까요?</h2><p class="hint">서비스를 선택하면 필요한 연결 항목만 표시됩니다. 키 저장만으로 인증·생성 성공이 확인되지는 않습니다.</p><div class="settings-provider-cards" role="group" aria-label="사용할 AI 서비스"></div>';
  groups.ai.panel.prepend(picker);
  const providerInfo={gemini_api:['Gemini','Google API 키','프레임·음성 분석'],openai_api:['OpenAI','OpenAI API 키','프레임 분석·글 작성'],kie_api:['KIE AI','KIE API 키 · 크레딧','여러 AI 모델을 한곳에서'],antigravity_cli:['Antigravity','Google 계정 로그인','기존 CLI 계정 연결'],codex_cli:['Codex','ChatGPT 계정 로그인','기존 CLI 계정 연결']};
  const cardButtons={};
  for(const [value,info] of Object.entries(providerInfo)){
    const button=document.createElement('button');button.type='button';button.className='settings-provider-card';button.dataset.provider=value;button.setAttribute('aria-pressed','false');button.innerHTML='<span class="settings-provider-top"><strong></strong><span class="settings-provider-selected"></span></span><span class="settings-provider-kind"></span><span class="settings-provider-description"></span>';
    button.querySelector('strong').textContent=info[0];button.querySelector('.settings-provider-kind').textContent=info[1];button.querySelector('.settings-provider-description').textContent=info[2];button.onclick=()=>{byId('ai-provider').value=value;byId('ai-provider').dispatchEvent(new Event('change',{bubbles:true}));};picker.querySelector('.settings-provider-cards').append(button);cardButtons[value]=button;
  }
  byId('ai-provider').closest('label').hidden=true;
  ai.classList.add('settings-connection-card');modelBox.classList.add('settings-configuration-card');
  const connectionBody=document.createElement('div');connectionBody.className='settings-connection-body';ai.append(connectionBody);connectionBody.append(keyBox,kie);
  kie.querySelector('h2').hidden=true;
  const modelActions=document.createElement('div');modelActions.className='settings-button-row';modelBox.append(modelActions);modelActions.append(byId('refresh-models'),byId('kie-inspect-model'));modelLabel.after(modelActions);
  const keyActions=document.createElement('div');keyActions.className='settings-button-row';keyBox.append(keyActions);keyActions.append(byId('save-ai-key'));
  const kieKeyActions=document.createElement('div');kieKeyActions.className='settings-button-row';byId('kie-key').closest('label').after(kieKeyActions);kieKeyActions.append(byId('kie-save-key'));
  const utilityActions=document.createElement('div');utilityActions.className='settings-button-row';extra.append(utilityActions);utilityActions.append(byId('kie-credit'),byId('kie-refresh-status'));
  const danger=document.createElement('div');danger.className='settings-danger-row';danger.append(byId('kie-clear-key'));extra.append(danger);
  const state=document.createElement('p');state.className='settings-selected-status';state.setAttribute('role','status');guide.after(state);
  const syncStatus=()=>{const provider=byId('ai-provider').value;state.textContent=provider==='kie_api'?byId('kie-status').textContent:provider.endsWith('_cli')?(byId('cli-status').textContent||'계정 로그인 상태를 확인하세요.'):(byId('key').placeholder.includes('등록됨')?'키 저장됨 · 실제 연결은 실행 시 확인합니다.':'API 키를 입력하고 저장하세요.');};
  const enhancedUpdate=()=>{update();const provider=byId('ai-provider').value;for(const [value,button] of Object.entries(cardButtons)){button.setAttribute('aria-pressed',String(value===provider));button.querySelector('.settings-provider-selected').textContent=value===provider?'선택됨':'';}ai.querySelector('h2').textContent='1. '+providerInfo[provider][0]+' 연결';keyBox.querySelector('h3').hidden=true;modelBox.querySelector('h2').textContent='2. 사용할 모델';syncStatus();};
  const serviceHelp=document.createElement('details');serviceHelp.className='settings-extra';serviceHelp.innerHTML='<summary>전송 데이터·지원 기능 안내</summary>';ai.append(serviceHelp);
  for(const host of [ai,kie])for(const note of [...host.children].filter(n=>n.tagName==='P'&&n.classList.contains('hint')&&!n.id))serviceHelp.append(note);
  byId('kie-status').hidden=true;
  const statusObserver=new MutationObserver(syncStatus);for(const id of ['kie-status','cli-status'])statusObserver.observe(byId(id),{childList:true,subtree:true,characterData:true});statusObserver.observe(byId('key'),{attributes:true,attributeFilter:['placeholder']});
  // Keep button placement consistent for the remaining service cards, too.
  for(const section of [...groups.search.panel.children,...groups.usage.panel.children]){section.classList.add('settings-service-card');for(const actions of section.querySelectorAll('.actions,.stage-action-bar'))actions.classList.add('settings-button-row');}
  byId('ai-provider').addEventListener('change',enhancedUpdate);enhancedUpdate();groups.ai.button.click();
})();
