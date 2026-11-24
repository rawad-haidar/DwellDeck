// Visual setup editor shown under Edit dashboard.
import {clone} from './util.mjs';
import {dependencyStatus} from './dependencies.mjs';
import {ROOM_CONTROL_DOMAINS, discoveryContext, discoverConfiguration} from './discovery.mjs';
import {DWELL_PALETTES, DEFAULT_PALETTE} from './theme.mjs';
import {detectionSensors, snapshotAutomation, cleanupAutomation, SNAPSHOT_DIR, SNAPSHOT_DAYS, CLEANUP_YAML} from './detection.mjs';
import {SLOTS, ROOM_TEMPLATES} from './data.mjs';

export class DwellDeckOriginalEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});}
  setConfig(config){
    // HA echoes each config-changed event. Keep the live form and its focus.
    if(JSON.stringify(this.config)===JSON.stringify(config))return;
    this.config=clone(config);this.render();
  }
  set hass(hass){this._hass=hass;this.shadowRoot.querySelectorAll('ha-form').forEach(f=>{f.hass=hass;});this.renderDependencies();}
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
    const roomDetails=document.createElement('details');roomDetails.open=true;const summary=document.createElement('summary');summary.textContent='Home Assistant areas and controls';roomDetails.append(summary);
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
      const details=document.createElement('details');details.open=true;
      const title=document.createElement('summary');title.textContent=room.name||'New room';details.append(title);
      details.append(this.form([{name:'name',selector:{text:{}}},{name:'area',selector:{area:{}}},{name:'entities',selector:{entity:{multiple:true,filter:{domain:['light','switch']}}}},{name:'exclude',selector:{entity:{multiple:true}}},{name:'discover_controls',selector:{boolean:{}}},{name:'controls',selector:{entity:{multiple:true,filter:{domain:ROOM_CONTROL_DOMAINS}}}},{name:'discover_lighting',selector:{boolean:{}}},{name:'temperature_sensors',selector:{entity:{multiple:true,filter:[{domain:'sensor',device_class:'temperature'},{domain:'climate'}]}}}],room,value=>{
        const extra_rooms=[...this.config.extra_rooms];extra_rooms[index]=value;this.change({...this.config,extra_rooms});
      },{name:'Room title',area:'Discover lights and switches from area',entities:'Lights and switches',exclude:'Excluded entities',discover_controls:'Discover room controls and sensors',controls:'Additional room controls and sensors',discover_lighting:'Filter automatic lighting discovery to lights and lighting switches',temperature_sensors:'Room temperature: temperature sensors or air conditioners (their current temperature); averaged when there are several, empty uses the room\'s own'}));
      const remove=document.createElement('button');remove.textContent='Remove room';remove.onclick=()=>{this.change({...this.config,extra_rooms:this.config.extra_rooms.filter((_,i)=>i!==index)});this.render();};details.append(remove);roomDetails.append(details);
    });
    const add=document.createElement('button');add.textContent='+ Add room';add.onclick=()=>{this.change({...this.config,extra_rooms:[...(this.config.extra_rooms||[]),{name:'New room',entities:[]}]});this.render();};roomDetails.append(add);
    this.shadowRoot.append(roomDetails);
    const domains=[...new Set(SLOTS.map(s=>s.domain))];
    for(const domain of domains){
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`${domain.replaceAll('_',' ')} entities`;details.append(summary);
      const domainSlots=SLOTS.filter(s=>s.domain===domain);const labels=Object.fromEntries(domainSlots.map(s=>[s.key,s.label]));
      details.append(this.form(domainSlots.map(s=>({name:s.key,selector:{entity:{filter:{domain:s.domain}}}})),Object.fromEntries(domainSlots.filter(s=>this.config.entities?.[s.key]!==undefined).map(s=>[s.key,this.config.entities[s.key]])),value=>this.change({...this.config,entities:{...this.config.entities,...value}}),labels));this.shadowRoot.append(details);
    }
    const style=document.createElement('style');style.textContent=':host{display:block}p{line-height:1.6;color:var(--secondary-text-color)}section,details{padding:18px;margin:12px 0;border:1px solid rgba(139,185,216,.2);border-radius:18px;background:linear-gradient(135deg,rgba(71,119,157,.12),rgba(27,45,64,.06))}summary{cursor:pointer;font-weight:600;padding:4px}ha-form{display:block;margin-top:14px}button{font:inherit;font-weight:600;color:#edf5ff;padding:12px 20px;margin:6px 8px 6px 0;border:1px solid rgba(137,194,232,.45);border-radius:13px;background:linear-gradient(120deg,#244b67,#375b82,#496d84);background-size:220% 100%;box-shadow:0 5px 16px rgba(0,0,0,.14);cursor:pointer;transition:background-position .6s ease,box-shadow .3s ease,transform .2s ease}button:hover{background-position:100% 50%;border-color:#ffd16b;box-shadow:0 0 20px rgba(255,209,107,.18);transform:translateY(-1px)}button:active{transform:scale(.98);background:linear-gradient(120deg,#8b6932,#b18a46);color:#fff4d9}button:focus-visible,summary:focus-visible{outline:2px solid #ffd16b;outline-offset:4px}button:disabled{opacity:.55;cursor:wait;transform:none}a{color:#87cef1;text-underline-offset:3px}@media(prefers-reduced-motion:reduce){button{transition:none;transform:none!important}}';this.shadowRoot.append(style);
  }
}
