// Visual setup editor shown under Edit dashboard.
import {clone} from './util.mjs';
import {dependencyStatus} from './dependencies.mjs';
import {ROOM_CONTROL_DOMAINS, discoveryContext, discoverConfiguration} from './discovery.mjs';
import {DWELL_PALETTES, DEFAULT_PALETTE} from './theme.mjs';
import {energyEditorValues, ENERGY_TOTALS, ENERGY_COMBINE} from './energy.mjs';
import {detectionSensors, snapshotAutomation, cleanupAutomation, SNAPSHOT_DIR, SNAPSHOT_DAYS, CLEANUP_YAML} from './detection.mjs';
import {SLOTS, ROOM_TEMPLATES} from './data.mjs';
import {guardAutomation, GUARD_ID} from './guard.mjs';
import {gensetSetup} from './genset.mjs';
import {KID_TABS, kidTabs, tabTarget, tabChoices, targetEntities} from './kids.mjs';

export class DwellDeckOriginalEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){
    // HA echoes each config-changed event. Keep the live form and its focus.
    if(JSON.stringify(this.config)===JSON.stringify(config))return;
    this.config=clone(config);this.render();
  }
  set hass(hass){const first=!this._hass;this._hass=hass;if(first)this.renderGenerator();this.shadowRoot.querySelectorAll('ha-form').forEach(f=>{f.hass=hass;});this.renderDependencies();
    // The energy fields show what is found, which needs Home Assistant's states: fill them once these arrive.
    if(this._energyForm&&!this._energyFilled&&!this.config.energy&&Object.keys(hass?.states||{}).length){this._energyFilled=true;this._energyForm.data=energyEditorValues(this.config,hass);}}
  change(config){
    if(JSON.stringify(this.config)===JSON.stringify(config))return;
    this.config=clone(config);
    this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:clone(this.config)},bubbles:true,composed:true}));
  }
  form(schema,data,callback,labels={}){
    const form=document.createElement('ha-form');form.schema=schema;form.data=data;form.hass=this._hass;
    form.computeLabel=field=>labels[field.name]||field.name.replaceAll('_',' ');
    form.addEventListener('value-changed',event=>{
      event.stopPropagation();
      const value=event.detail?.value;
      if(!value||typeof value!=='object')return;
      // ha-form computes the next edit from data, so advance its local data too.
      form.data=clone(value);callback(value);
    });return form;
  }
  renderDependencies(){
    const container=this.shadowRoot.querySelector('[data-dependencies]');if(!container)return;
    container.replaceChildren();
    const heading=document.createElement('h3');heading.textContent='Installation checklist';container.append(heading);
    const help=document.createElement('p');help.textContent='Install missing items using the links, then refresh this page. Browser Mod also needs its integration set up in Devices & services. No theme file or configuration.yaml change is needed.';container.append(help);
    for(const item of dependencyStatus(this._hass,customElements)){
      const row=document.createElement('p');const label=document.createElement('span');label.textContent=`${item.ready?'✓ Ready':'○ Not detected'} · ${item.name} `;
      const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.ready?'Open in HACS':'Install in HACS';row.append(label,link);container.append(row);
    }
    const check=document.createElement('button');check.textContent='Check again';check.onclick=()=>this.renderDependencies();container.append(check);
  }
  // The whole dashboard as an administrator sees it, to list each tab's cards for limited users.
  renderGenerator(){
    const box=this._generatorBox;if(!box||!this._hass?.states)return;
    const found=gensetSetup({...this.config,generator:{...(this.config.generator||{}),show:true}},this._hass);
    box.replaceChildren();
    if(!found&&!this.config.generator)return;
    const own=this.config.generator||{};
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Generator';details.append(summary);
    const help=document.createElement('p');help.textContent='Shown on the Energy page: live readings, the controller buttons and its history. Sensors are found by their gen_ names; change any of them here.';details.append(help);
    const sensor=name=>({name,selector:{entity:{filter:{domain:'sensor'}}}});
    details.append(this.form([{name:'show',selector:{boolean:{}}},{name:'name',selector:{text:{}}},
      sensor('mode'),sensor('power'),sensor('rpm'),sensor('voltage'),sensor('frequency'),sensor('coolant'),sensor('battery'),sensor('oil'),sensor('fuel'),sensor('mains'),sensor('stage')],
      {show:own.show!==false,name:own.name||'',...Object.fromEntries(['mode','power','rpm','voltage','frequency','coolant','battery','oil','fuel','mains','stage'].map(k=>[k,own[k]??found?.[k]??undefined]).filter(([,v])=>v))},
      value=>{
        const next={...own};
        next.show=value.show!==false;if(next.show)delete next.show;
        if(value.name)next.name=value.name;else delete next.name;
        for(const k of ['mode','power','rpm','voltage','frequency','coolant','battery','oil','fuel','mains','stage']){if(value[k]&&value[k]!==found?.[k])next[k]=value[k];else if(!value[k]&&found?.[k])next[k]=null;else delete next[k];}
        const config={...this.config};if(Object.keys(next).length)config.generator=next;else delete config.generator;this.change(config);
      },{show:'Show the generator on the Energy page',name:'Name (for example DSE 6110 MKIII)',mode:'Control mode',power:'Load (power)',rpm:'Engine speed',voltage:'Output voltage',frequency:'Frequency',coolant:'Coolant temperature',battery:'Battery voltage',oil:'Oil pressure',fuel:'Fuel level',mains:'Mains voltage (the controller\'s own reading)',stage:'Engine state (optional, from the controller)'}));
    box.append(details);
  }
  async fullDashboard(){
    const strategy=customElements.get('ll-strategy-dashboard-dwelldeck-original');
    const config={...this.config};delete config.kids;
    return strategy.generate(config,this._hass);
  }
  // One tab's dropdown: its cards grouped under their headings. Ticking a card shares it; its own
  // dropdown then lists what is on it, all ticked, to leave some out. Nothing ticked: the whole tab.
  tabPicker(user,label,choices,target,onChange,whenEmpty='everything on this tab'){
    const box=document.createElement('details');box.className='tab-access';
    const summary=document.createElement('summary');box.append(summary);
    if(!choices.length){
      box.append(this.form([{name:'pick',selector:{target:{}}}],{pick:target||{}},value=>{
        const t=value.pick||{};const keep=Object.fromEntries(['area_id','device_id','entity_id'].map(k=>[k,[].concat(t[k]||[])]).filter(([,v])=>v.length));
        onChange(Object.keys(keep).length?keep:null);
      },{pick:`What ${user.name} sees on ${label} (empty: everything)`}));
      summary.textContent=`${label}`;return box;
    }
    const given=target?targetEntities(target,this._hass):new Set();
    const chosen=new Set(target?.cards?.length?choices.filter(c=>target.cards.includes(c.key)||target.cards.includes(c.before)).map(c=>c.key)
      :target?choices.filter(c=>c.refs.every(id=>given.has(id))).map(c=>c.key):[]);
    const allowed=new Set(target?.cards?.length?(target.entity_id||[]):choices.filter(c=>chosen.has(c.key)).flatMap(c=>c.refs));
    const name=id=>this._hass?.states?.[id]?.attributes?.friendly_name||id;
    const count=()=>{summary.textContent=`${label}: ${chosen.size?`${chosen.size} of ${choices.length} cards`:whenEmpty}`;};
    const emit=()=>{
      count();
      const picked=choices.filter(c=>chosen.has(c.key));
      if(!picked.length){onChange(null);return;}
      onChange({cards:picked.map(c=>c.key),entity_id:[...new Set(picked.flatMap(c=>c.refs).filter(id=>allowed.has(id)))].sort()});
    };
    const groups=new Map();for(const choice of choices){const g=choice.heading||label;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(choice);}
    for(const [heading,items] of groups){
      const group=groups.size>1?document.createElement('details'):box;
      if(group!==box){const gs=document.createElement('summary');gs.textContent=heading;group.append(gs);box.append(group);}
      for(const choice of items){
        const row=document.createElement('div');row.className='card-access';
        const tick=document.createElement('label');const box1=document.createElement('input');box1.type='checkbox';box1.checked=chosen.has(choice.key);
        tick.append(box1,document.createTextNode(` ${choice.label.startsWith(heading+' · ')?choice.label.slice(heading.length+3):choice.label}`));row.append(tick);
        const inner=document.createElement('details');const innerSummary=document.createElement('summary');inner.append(innerSummary);
        const innerCount=()=>{const n=choice.refs.filter(id=>allowed.has(id)).length;innerSummary.textContent=`Items on this card: ${n} of ${choice.refs.length}`;};
        for(const id of [...choice.refs].sort((a,b)=>name(a).localeCompare(name(b)))){
          const item=document.createElement('label');item.className='item-access';const cb=document.createElement('input');cb.type='checkbox';cb.checked=allowed.has(id);
          cb.onchange=()=>{if(cb.checked)allowed.add(id);else allowed.delete(id);innerCount();emit();};
          item.append(cb,document.createTextNode(` ${name(id)}`));inner.append(item);
        }
        innerCount();inner.hidden=!box1.checked||choice.refs.length<2;
        box1.onchange=()=>{
          if(box1.checked){chosen.add(choice.key);for(const id of choice.refs)allowed.add(id);
            inner.querySelectorAll('input').forEach(cb=>{cb.checked=true;});}
          else chosen.delete(choice.key);
          inner.hidden=!box1.checked||choice.refs.length<2;innerCount();emit();
        };
        row.append(inner);group.append(row);
      }
    }
    count();return box;
  }
  async renderLimitedUsers(container){
    let users;
    try{users=await this._hass.callWS({type:'config/auth/list'});}
    catch(error){container.textContent='The user list could not be read. Only an administrator can set up limited users.';return;}
    const limitedUsers=users.filter(user=>!user.system_generated&&user.is_active!==false&&!(user.group_ids||[]).includes('system-admin'))
      .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    container.replaceChildren();
    const full=await this.fullDashboard().catch(()=>null);
    const choicesFor=tab=>tabChoices(full?.views?.find(view=>view.path===tab),this._hass);
    if(!limitedUsers.length){container.textContent='No non-administrator users yet. Add one in Settings \u2192 People, with Administrator turned off.';return;}
    for(const user of limitedUsers){
      const entry=(this.config.kids||[]).find(kid=>kid.user===user.id||String(kid.user).toLowerCase()===String(user.name).toLowerCase());
      // Tabs first; each ticked tab gets a dropdown of its cards, and each ticked card one of its items.
      const holder=document.createElement('div');container.append(holder);
      const mineNow=()=>(this.config.kids||[]).find(kid=>kid.user===user.id||String(kid.user).toLowerCase()===String(user.name).toLowerCase());
      const write=(tabs,access)=>{
        const others=(this.config.kids||[]).filter(kid=>kid!==mineNow());
        const mine={user:user.id,name:user.name,tabs};if(Object.keys(access).length)mine.access=access;
        const kids=tabs.length?[...others,mine]:others;
        const next={...this.config};if(kids.length)next.kids=kids;else delete next.kids;
        this.change(next);
      };
      const draw=()=>{
        const current=mineNow();
        const tabs=kidTabs(current);
        const tabsForm=this.form([{name:'tabs',selector:{select:{multiple:true,mode:'list',options:KID_TABS.map(([value,label])=>({value,label}))}}}],{tabs},value=>{
          const cur=mineNow(),nextTabs=value.tabs||[];
          const access={};for(const tab of nextTabs){const target=tabTarget(cur,tab);if(target)access[tab]=Object.fromEntries(Object.entries(target).filter(([,v])=>v?.length));}
          write(nextTabs,access);
          if(nextTabs.join()!==tabs.join())draw();
        },{tabs:`${user.name}: tabs they can see`});
        const pickers=KID_TABS.filter(([tab])=>tabs.includes(tab)).map(([tab,label])=>this.tabPicker(user,label,choicesFor(tab),tabTarget(current,tab),access=>{
          const cur=mineNow();const all={};
          for(const t of kidTabs(cur)){const target=tabTarget(cur,t);if(target)all[t]=Object.fromEntries(Object.entries(target).filter(([,v])=>v?.length));}
          if(access)all[tab]=access;else delete all[tab];
          write(kidTabs(cur),all);
        },tab==='home'&&tabs.length>1?'only what the other tabs give':'everything on this tab'));
        holder.replaceChildren(tabsForm,...pickers);
      };
      draw();
    }
    // Hiding is not blocking: the guard automation undoes what a limited user changes outside their rooms.
    const guardTitle=document.createElement('h3');guardTitle.textContent='Protection';
    const guardHelp=document.createElement('p');guardHelp.textContent='Home Assistant lets every signed-in user control every device; the page above only hides things. Protection adds an automation, \u201cDwellDeck \u00b7 Guard\u201d, that sets back anything a limited user changes outside their rooms (switches such as the boiler and pool filter, valves, other rooms\u2019 air conditioners, curtains, locks, automations) and leaves you a notification. Their own rooms\u2019 lights, TVs and air conditioners are not touched.';
    container.append(guardTitle,guardHelp,this.form([{name:'protected',selector:{entity:{multiple:true}}}],{protected:this.config.protected||[]},value=>{
      const next={...this.config};if(value.protected?.length)next.protected=value.protected;else delete next.protected;this.change(next);
    },{protected:'Also protect these (any device, even lights in their rooms)'}));
    const save=document.createElement('button');save.textContent='Save protection';
    const status=document.createElement('p');status.setAttribute('role','status');
    status.textContent=this.config.guard?'Protection is on. Press Save protection again after changing users, rooms or devices.':'Pick rooms above, then press Save protection.';
    save.onclick=async()=>{
      save.disabled=true;status.textContent='Saving the guard automation\u2026';
      try{
        const kids=(this.config.kids||[]).filter(kid=>kidTabs(kid).length);
        if(!kids.length){
          await this._hass.callApi('DELETE',`config/automation/config/${GUARD_ID}`).catch(()=>{});
          const next={...this.config};delete next.guard;this.change(next);
          status.textContent='No limited users, so protection is off and the guard automation was removed.';save.disabled=false;return;
        }
        const automation=guardAutomation(this.config,await discoveryContext(this._hass).catch(()=>this._hass),users);
        await this._hass.callApi('POST',`config/automation/config/${GUARD_ID}`,automation);
        let loaded=false;
        for(let i=0;i<20&&!loaded;i++){loaded=Object.values(this._hass.states).some(state=>state.entity_id.startsWith('automation.')&&state.attributes.id===GUARD_ID);if(!loaded)await new Promise(resolve=>setTimeout(resolve,250));}
        if(!loaded){status.textContent='The guard was saved, but Home Assistant did not load it. Make sure configuration.yaml contains \u201cautomation: !include automations.yaml\u201d, restart, then press Save protection again.';save.disabled=false;return;}
        this.change({...this.config,guard:true});
        const names=Object.keys(automation.variables.allowed).map(id=>users.find(user=>user.id===id)?.name).filter(Boolean);
        status.textContent=`Protection is on for ${names.join(', ')}. Save the dashboard too.`;
      }catch(error){status.textContent=`Could not save protection: ${error.message||error.body?.message||'administrator access is required'}`;}
      save.disabled=false;
    };
    container.append(save,status);
  }
  render(){
    if(!this.config)return;
    this.shadowRoot.replaceChildren();
    const appearance=document.createElement('section');
    const appearanceTitle=document.createElement('h3');appearanceTitle.textContent='Theme colour';appearance.append(appearanceTitle);
    const appearanceHelp=document.createElement('p');appearanceHelp.textContent='Choose a palette, then Save. Lamplight keeps colour for things that are on; the others are the original colour schemes.';appearance.append(appearanceHelp);
    const swatches=document.createElement('div');swatches.setAttribute('role','group');swatches.setAttribute('aria-label','Theme colour');
    for(const [key,palette] of Object.entries(DWELL_PALETTES)){
      const button=document.createElement('button');button.type='button';
      button.textContent=palette.name;
      button.setAttribute('aria-pressed',String((this.config.color_palette || DEFAULT_PALETTE)===key));
      button.style.background=`linear-gradient(120deg,${palette.colors[0]},${palette.colors[1]})`;
      button.style.borderColor=palette.colors[3];
      button.style.borderWidth=(this.config.color_palette || DEFAULT_PALETTE)===key?'3px':'1px';
      button.onclick=()=>{this.change({...this.config,color_palette:key});for(const other of swatches.querySelectorAll('button')){const selected=other===button;other.setAttribute('aria-pressed',String(selected));other.style.borderWidth=selected?'3px':'1px';}};
      swatches.append(button);
    }
    appearance.append(swatches);this.shadowRoot.append(appearance);
    const dependencies=document.createElement('section');dependencies.dataset.dependencies='';this.shadowRoot.append(dependencies);this.renderDependencies();
    const p=document.createElement('p');p.textContent='Original Home page, tabs and popup design. Configure lighting rooms below, then bind climate, energy, security and other entities. Save to update every reference together.';this.shadowRoot.append(p);
    this.shadowRoot.append(this.form([
      {name:'title',selector:{text:{}}},{name:'dashboard_path',selector:{text:{}}},{name:'theme',selector:{text:{}}},{name:'music_app',selector:{text:{}}}
    ],{title:this.config.title||'DwellDeck',dashboard_path:this.config.dashboard_path,theme:this.config.theme,music_app:this.config.music_app},data=>this.change({...this.config,...data}),{dashboard_path:'Dashboard URL path (leave empty to detect automatically)',music_app:'Music Assistant app path (optional)',theme:'Optional installed theme (leave empty for built-in colors)'}));
    const discover = document.createElement('button');
    discover.textContent = 'Discover rooms and devices';
    const discoveryStatus = document.createElement('p');
    discoveryStatus.setAttribute('role', 'status');
    discover.onclick = async () => {
      discover.disabled = true;
      discoveryStatus.textContent = 'Reading Home Assistant areas and devices…';
      try {
        const context = await discoveryContext(this._hass);
        const config = discoverConfiguration(this.config, context);
        config.auto_discover = true;
        this.change(config);
        this.render();
      } catch (error) {
        discoveryStatus.textContent = `Discovery failed: ${error.message}`;
        discover.disabled = false;
      }
    };
    this.shadowRoot.append(discover, discoveryStatus);
    // Detection snapshots: create or update one automation that saves a picture at each detection.
    const snapshots = document.createElement('button');
    snapshots.textContent = this.config.detection_snapshots ? 'Update detection snapshots' : 'Set up detection snapshots';
    const snapshotStatus = document.createElement('p');
    snapshotStatus.setAttribute('role', 'status');
    snapshotStatus.textContent = this.config.detection_snapshots
      ? 'Detection snapshots are on. Press again after adding cameras or detection sensors.'
      : `Saves the latest picture of each human or vehicle detection to ${SNAPSHOT_DIR} (login required to view), using an automation named “DwellDeck · Detection snapshots”.`;
    snapshots.onclick = async () => {
      snapshots.disabled = true;
      snapshotStatus.textContent = 'Finding detection sensors and their cameras…';
      try {
        const sensors = detectionSensors(await discoveryContext(this._hass));
        const automation = snapshotAutomation(sensors);
        const linked = sensors.filter(sensor => sensor.camera);
        if (!automation.triggers.length) {
          snapshotStatus.textContent = sensors.length
            ? `Found ${sensors.length} detection sensors, but none is linked to a camera. Put each sensor on its camera’s device, or name the camera like the sensors.`
            : 'No human or vehicle detection sensors found. Their names need to contain person, human, vehicle or car detection.';
          snapshots.disabled = false;
          return;
        }
        await this._hass.callApi('POST', 'config/automation/config/dwelldeck_detection_snapshots', automation);
        // Home Assistant only loads UI automations when configuration.yaml includes automations.yaml.
        let loaded = false;
        for (let i = 0; i < 20 && !loaded; i++) {
          loaded = Object.values(this._hass.states).some(state => state.entity_id.startsWith('automation.') && state.attributes.id === 'dwelldeck_detection_snapshots');
          if (!loaded) await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!loaded) {
          snapshotStatus.textContent = 'The snapshot automation was saved, but Home Assistant did not load it. Make sure configuration.yaml contains “automation: !include automations.yaml”, restart, then press this button again.';
          snapshots.disabled = false;
          return;
        }
        this.change({...this.config, detection_snapshots: true});
        const unlinked = sensors.filter(sensor => !sensor.camera).map(sensor => sensor.cam);
        // Keep 30 days per camera: a nightly cleanup, when the shell command for it exists.
        const canClean = !!this._hass.services?.shell_command?.dwelldeck_snapshot_cleanup;
        if (canClean) await this._hass.callApi('POST', 'config/automation/config/dwelldeck_snapshot_cleanup', cleanupAutomation());
        snapshotStatus.textContent = `Snapshots set up for ${linked.length} sensors on ${automation.triggers.length} cameras.` +
          (unlinked.length ? ` No camera found for: ${[...new Set(unlinked)].join(', ')}.` : '') + ' Save the dashboard to show them. ' +
          (canClean ? `Snapshots older than ${SNAPSHOT_DAYS} days are deleted every night.`
            : `To keep only the last ${SNAPSHOT_DAYS} days, add this to configuration.yaml, restart, and press this button again:\n${CLEANUP_YAML}`);
        snapshotStatus.style.whiteSpace = 'pre-wrap';
        snapshots.textContent = 'Update detection snapshots';
      } catch (error) {
        snapshotStatus.textContent = `Could not set up snapshots: ${error.message || error.body?.message || 'administrator access is required'}`;
      }
      snapshots.disabled = false;
    };
    this.shadowRoot.append(snapshots, snapshotStatus);
    // Energy page sensors: found automatically; shown here so they can be checked and changed.
    const energy = document.createElement('details');
    const energyTitle = document.createElement('summary');
    energyTitle.textContent = 'Energy page sensors';
    const energyNote = document.createElement('p');
    energyNote.textContent = this.config.energy
      ? 'These sensors were chosen here. Several sensors in one field are added up (for inverters in parallel).'
      : 'Found automatically from your inverters. Change any field to choose sensors yourself; several in one field are added up.';
    const power = {entity: {multiple: true, filter: {domain: 'sensor', device_class: 'power'}}};
    const kwh = {entity: {multiple: true, filter: {domain: 'sensor', device_class: 'energy'}}};
    // Several sensors in one field: added up (inverters in parallel), averaged (like battery level), or one line each.
    const combine = {select: {mode: 'dropdown', options: [{value: 'sum', label: 'Add them up'}, {value: 'average', label: 'Average them'}, {value: 'each', label: 'One line each in the graphs (added up in the flow)'}]}};
    const totalLabels = {solar: 'solar produced', home: 'home used', charge: 'battery charged', discharge: 'battery discharged', import: 'from the grid', export: 'to the grid'};
    this._energyFilled = Object.keys(this._hass?.states || {}).length > 0;
    energy.append(energyTitle, energyNote, this._energyForm = this.form([
      {name: 'solar', selector: power}, {name: 'solar_combine', selector: combine}, {name: 'home', selector: power}, {name: 'home_combine', selector: combine},
      {name: 'battery', selector: power}, {name: 'battery_combine', selector: combine}, {name: 'grid', selector: power}, {name: 'grid_combine', selector: combine},
      {name: 'battery_soc', selector: {entity: {multiple: true, filter: {domain: 'sensor', device_class: 'battery'}}}}, {name: 'battery_soc_combine', selector: combine},
      {name: 'battery_charging', selector: {select: {mode: 'dropdown', options: [{value: 'negative', label: 'Negative while charging (Deye, most hybrid inverters)'}, {value: 'positive', label: 'Positive while charging'}]}}},
      {name: 'grid_import', selector: {select: {mode: 'dropdown', options: [{value: 'positive', label: 'Positive while importing (Deye, most inverters)'}, {value: 'negative', label: 'Negative while importing'}]}}},
      {name: 'energy_combine', selector: combine},
      ...ENERGY_TOTALS.map(key => ({name: `today_${key}`, selector: kwh})),
      ...ENERGY_TOTALS.map(key => ({name: `total_${key}`, selector: kwh}))
    ], energyEditorValues(this.config, this._hass || {}), value => this.change({...this.config, energy: value}), {
      solar: 'Solar power', home: 'Home power (inverter output)', battery: 'Battery power', grid: 'Grid power', battery_soc: 'Battery level (%)',
      battery_charging: 'Battery power sign', grid_import: 'Grid power sign',
      solar_combine: 'Several solar sensors', home_combine: 'Several home sensors', battery_combine: 'Several battery power sensors', grid_combine: 'Several grid sensors',
      battery_soc_combine: 'Several battery level sensors', energy_combine: 'Several energy (kWh) sensors, for Today and History',
      ...Object.fromEntries(ENERGY_TOTALS.map(key => [`today_${key}`, `Today: ${totalLabels[key]} (kWh)`])),
      ...Object.fromEntries(ENERGY_TOTALS.map(key => [`total_${key}`, `Running total: ${totalLabels[key]} (kWh, for the 30-day graphs)`]))
    }));
    if (this.config.energy) {
      const auto = document.createElement('button');
      auto.textContent = 'Find energy sensors automatically again';
      auto.onclick = () => { const next = {...this.config}; delete next.energy; this.change(next); this.render(); };
      energy.append(auto);
    }
    this.shadowRoot.append(energy);
    // Generator: only for homes that have one (found by its sensors, or set by hand). Filled once
    // Home Assistant's states arrive.
    this._generatorBox=document.createElement('div');this.shadowRoot.append(this._generatorBox);this.renderGenerator();
    const discoverySummary = document.createElement('p');
    discoverySummary.textContent = `${Object.values(this.config.rooms || {}).filter(room => room.area).length + (this.config.extra_rooms || []).length} rooms configured · ${Object.keys(this.config.entities || {}).length} entity bindings. Save the dashboard configuration to apply changes.`;
    this.shadowRoot.append(discoverySummary);
    this.shadowRoot.append(this.form([
      {name: 'auto_discover', selector: {boolean: {}}},
      {name: 'room_controls', selector: {boolean: {}}},
      {name: 'camera_detection', selector: {boolean: {}}},
      {name: 'readable_font', selector: {boolean: {}}}
    ], {auto_discover: !!this.config.auto_discover, room_controls: !!this.config.room_controls, camera_detection: this.config.camera_detection !== false, readable_font: this.config.font !== 'system'},
    ({readable_font, ...value}) => {
      const next = {...this.config, ...value};
      if (readable_font === false) next.font = 'system'; else delete next.font;
      this.change(next);
    }, {
      auto_discover: 'Discover newly added areas automatically',
      room_controls: 'Show room controls and sensors in room popups',
      camera_detection: 'Show camera human and vehicle detection on the Security page',
      readable_font: 'Use the Atkinson Hyperlegible font (loaded from Google Fonts). Off uses the Home Assistant font.'
    }));
    const roomDetails=document.createElement('details');
    // Closed at first; stays as it was (open after adding or removing a room) while the editor is open.
    roomDetails.open=!!this._roomsOpen;roomDetails.addEventListener('toggle',()=>{this._roomsOpen=roomDetails.open;});const summary=document.createElement('summary');summary.textContent='Home Assistant areas and controls';roomDetails.append(summary);
    const editorRooms = this.config.area_rooms
      ? Object.entries(this.config.rooms || {}).map(([key, room]) => ({key, name: room.name, placeholders: []}))
      : ROOM_TEMPLATES;
    for(const room of editorRooms){
      const details=document.createElement('details');const title=document.createElement('summary');title.textContent=this.config.rooms?.[room.key]?.name||room.name;details.append(title);
      details.append(this.form([
        {name:'name',selector:{text:{}}},{name:'area',selector:{area:{}}},{name:'entities',selector:{entity:{multiple:true,filter:{domain:['light','switch']}}}},{name:'exclude',selector:{entity:{multiple:true}}},{name:'discover_controls',selector:{boolean:{}}},{name:'controls',selector:{entity:{multiple:true,filter:{domain:ROOM_CONTROL_DOMAINS}}}},{name:'discover_lighting',selector:{boolean:{}}},{name:'temperature_sensors',selector:{entity:{multiple:true,filter:[{domain:'sensor',device_class:'temperature'},{domain:'climate'}]}}}
      ],this.config.rooms?.[room.key]||{entities:room.placeholders.map(id=>{const slot=SLOTS.find(s=>s.placeholder===id);return this.config.entities?.[slot?.key];}).filter(Boolean)},value=>this.change({...this.config,rooms:{...this.config.rooms,[room.key]:value}}),{name:'Room title',area:'Discover lights and switches from area',entities:'Lights and switches',exclude:'Excluded entities',discover_controls:'Discover room controls and sensors',controls:'Additional room controls and sensors',discover_lighting:'Filter automatic lighting discovery to lights and lighting switches',temperature_sensors:'Room temperature: temperature sensors or air conditioners (their current temperature); averaged when there are several, empty uses the room\'s own'}));roomDetails.append(details);
    }
    (this.config.extra_rooms||[]).forEach((room,index)=>{
      const details=document.createElement('details');details.open=room.name==='New room';
      const title=document.createElement('summary');title.textContent=room.name||'New room';details.append(title);
      details.append(this.form([{name:'name',selector:{text:{}}},{name:'area',selector:{area:{}}},{name:'entities',selector:{entity:{multiple:true,filter:{domain:['light','switch']}}}},{name:'exclude',selector:{entity:{multiple:true}}},{name:'discover_controls',selector:{boolean:{}}},{name:'controls',selector:{entity:{multiple:true,filter:{domain:ROOM_CONTROL_DOMAINS}}}},{name:'discover_lighting',selector:{boolean:{}}},{name:'temperature_sensors',selector:{entity:{multiple:true,filter:[{domain:'sensor',device_class:'temperature'},{domain:'climate'}]}}}],room,value=>{
        const extra_rooms=[...this.config.extra_rooms];extra_rooms[index]=value;this.change({...this.config,extra_rooms});
      },{name:'Room title',area:'Discover lights and switches from area',entities:'Lights and switches',exclude:'Excluded entities',discover_controls:'Discover room controls and sensors',controls:'Additional room controls and sensors',discover_lighting:'Filter automatic lighting discovery to lights and lighting switches',temperature_sensors:'Room temperature: temperature sensors or air conditioners (their current temperature); averaged when there are several, empty uses the room\'s own'}));
      const remove=document.createElement('button');remove.textContent='Remove room';remove.onclick=()=>{this.change({...this.config,extra_rooms:this.config.extra_rooms.filter((_,i)=>i!==index)});this.render();};details.append(remove);roomDetails.append(details);
    });
    const add=document.createElement('button');add.textContent='+ Add room';add.onclick=()=>{this.change({...this.config,extra_rooms:[...(this.config.extra_rooms||[]),{name:'New room',entities:[]}]});this.render();};roomDetails.append(add);
    this.shadowRoot.append(roomDetails);
    const limited=document.createElement('details');const limitedTitle=document.createElement('summary');limitedTitle.textContent='Limited users';limited.append(limitedTitle);
    const limitedHelp=document.createElement('p');limitedHelp.textContent='Your non-administrator users are listed here. Tick the tabs someone can see. Each ticked tab opens a dropdown of its cards, grouped under their headings: tick the cards they can see, then open a ticked card to leave some of its items out. Tick no card for everything on that tab. Rooms picked for the Rooms tab are also the only rooms on their Home and Lights pages. Leave the tabs empty for the full dashboard. Protection below sets back changes to anything not picked for them. This limits what DwellDeck shows, not what Home Assistant allows: also set your other dashboards to Admin only (Settings \u2192 Dashboards).';limited.append(limitedHelp);
    const limitedList=document.createElement('div');limitedList.textContent='Loading users\u2026';limited.append(limitedList);
    if((this.config.kids||[]).length)limited.open=true;
    this.renderLimitedUsers(limitedList);
    this.shadowRoot.append(limited);
    const domains=[...new Set(SLOTS.map(s=>s.domain))];
    for(const domain of domains){
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${domain.replaceAll('_',' ')} entities`;details.append(summary);
      const domainSlots=SLOTS.filter(s=>s.domain===domain);const labels=Object.fromEntries(domainSlots.map(s=>[s.key,s.label]));
      details.append(this.form(domainSlots.map(s=>({name:s.key,selector:{entity:{filter:{domain:s.domain}}}})),Object.fromEntries(domainSlots.filter(s=>this.config.entities?.[s.key]!==undefined).map(s=>[s.key,this.config.entities[s.key]])),value=>this.change({...this.config,entities:{...this.config.entities,...value}}),labels));this.shadowRoot.append(details);
    }
    const style=document.createElement('style');style.textContent=':host{display:block}p{line-height:1.6;color:var(--secondary-text-color)}section,details{padding:18px;margin:12px 0;border:1px solid rgba(139,185,216,.2);border-radius:18px;background:linear-gradient(135deg,rgba(71,119,157,.12),rgba(27,45,64,.06))}summary{cursor:pointer;font-weight:600;padding:4px}ha-form{display:block;margin-top:14px}button{font:inherit;font-weight:600;color:#edf5ff;padding:12px 20px;margin:6px 8px 6px 0;border:1px solid rgba(137,194,232,.45);border-radius:13px;background:linear-gradient(120deg,#244b67,#375b82,#496d84);background-size:220% 100%;box-shadow:0 5px 16px rgba(0,0,0,.14);cursor:pointer;transition:background-position .6s ease,box-shadow .3s ease,transform .2s ease}button:hover{background-position:100% 50%;border-color:#ffd16b;box-shadow:0 0 20px rgba(255,209,107,.18);transform:translateY(-1px)}button:active{transform:scale(.98);background:linear-gradient(120deg,#8b6932,#b18a46);color:#fff4d9}button:focus-visible,summary:focus-visible{outline:2px solid #ffd16b;outline-offset:4px}button:disabled{opacity:.55;cursor:wait;transform:none}a{color:#87cef1;text-underline-offset:3px}details.tab-access{margin:10px 0;padding:10px 14px}details.tab-access details{margin:6px 0 6px 14px;padding:6px 10px;border-radius:12px}.card-access{margin:4px 0}.card-access details{margin-left:26px}.item-access{display:block;margin:4px 0 4px 6px}input[type=checkbox]{width:18px;height:18px;vertical-align:-3px}@media(prefers-reduced-motion:reduce){button{transition:none;transform:none!important}}';this.shadowRoot.append(style);
  }
}
