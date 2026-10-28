
// Geolocalización V7. Requiere SQL/migracion_rutas_v7.sql.
const rv = { routes: [], links: [], consumption: 12, price: null, driver: '', period: 'all' };
function rvDate(d){ return d ? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(2,4) : 'Sin fecha'; }
function rvName(r){ return 'Ruta-'+rvDate(r.fecha)+(r.viaje>1?' · Viaje '+r.viaje:''); }
function rvPickup(p){ return /retira por dep[oó]sito/i.test(p.transportista||''); }
function rvMoney(r){const l=Number(r.distancia_km||0)*Number(r.consumo_l_100km||12)/100;return l.toFixed(1)+' L'+(r.precio_litro==null?' · Sin precio':' · '+money(l*r.precio_litro));}
function rvLinks(id){return rv.links.filter(x=>x.ruta_id===id);}
async function rvLoad(){
 if(!sb)return;
 const a=await sb.from('rutas').select('*').order('fecha',{ascending:false});
 const b=await sb.from('ruta_pedidos').select('*');
 if(a.error||b.error){$('#rvMessage').textContent='Ejecutá SQL/migracion_rutas_v7.sql en Supabase: '+(a.error||b.error).message;return;}
 rv.routes=a.data||[];rv.links=b.data||[];rvRender();
}
function rvRender(){
 const drivers=[...new Set([...rv.routes.map(r=>r.transportista),...cache.pedidos.map(p=>p.transportista||'Sin asignar')])].sort();
 $('#rvDriver').innerHTML='<option value="">Todos los transportistas</option>'+drivers.map(x=>'<option>'+esc(x)+'</option>').join('');
 $('#rvDriver').value=rv.driver;
 const today=iso(new Date());
 for(const past of [true,false]){
  const id=past?'rvPast':'rvFuture';
  const rows=rv.routes.filter(r=>(r.fecha<today)===past&&(!rv.driver||r.transportista===rv.driver)&&(rv.period==='all'||(rv.period==='past')===past));
  $('#'+id).innerHTML=rows.map(r=>'<tr><td>'+esc(rvName(r))+'</td><td>'+esc(r.transportista)+'</td><td>'+esc(r.estado)+'</td><td>'+rvLinks(r.id).filter(m=>m.incluido).length+'</td><td>'+Number(r.distancia_km||0).toFixed(1)+' km</td><td>'+Math.round(r.duracion_min||0)+' min</td><td>'+rvMoney(r)+'</td><td><button data-rv-open="'+r.id+'">Detalle</button><button data-rv-done="'+r.id+'">'+(r.estado==='REALIZADA'?'Reabrir':'Realizada')+'</button></td></tr>').join('')||'<tr><td colspan="8">Sin rutas</td></tr>';
 }
 document.querySelectorAll('[data-rv-open]').forEach(b=>b.onclick=()=>rvOpen(b.dataset.rvOpen));
 document.querySelectorAll('[data-rv-done]').forEach(b=>b.onclick=()=>rvDone(b.dataset.rvDone));
}
async function rvDone(id){
 const r=rv.routes.find(x=>x.id===id);if(!r)return;
 const {error}=await sb.from('rutas').update({estado:r.estado==='REALIZADA'?'PLANIFICADA':'REALIZADA'}).eq('id',id);
 if(error)toast(error.message);else await rvLoad();
}
async function rvRoad(orders){
 const points=[[DEPOT.lng,DEPOT.lat],...orders.map(p=>[Number(p.longitud),Number(p.latitud)]),[DEPOT.lng,DEPOT.lat]];
 const response=await fetch('https://router.project-osrm.org/route/v1/driving/'+points.map(p=>p.join(',')).join(';')+'?overview=full&geometries=geojson&steps=true');
 if(!response.ok)throw Error('OSRM HTTP '+response.status);
 const json=await response.json();if(json.code!=='Ok'||!json.routes?.[0])throw Error('OSRM no encontró un recorrido');
 const route=json.routes[0],back=route.legs.at(-1);
 const steps=[];
 route.legs.forEach((leg,i)=>{steps.push('Tramo '+(i+1)+' · '+(leg.distance/1000).toFixed(1)+' km · '+Math.round(leg.duration/60)+' min');leg.steps.forEach(s=>steps.push((s.maneuver?.type||'Continuar')+' '+(s.maneuver?.modifier||'')+' · '+(s.name||'calle sin nombre')+' · '+Math.round(s.distance)+' m'));});
 return {distancia_km:route.distance/1000,duracion_min:route.duration/60,retorno_km:back.distance/1000,retorno_min:back.duration/60,geometria:route.geometry,instrucciones:steps};
}
function rvDraw(r){
 if(!r.geometria)return toast('Ruta sin geometría calculada');
 initMap();clearMapItems();
 const layer=L.geoJSON(r.geometria,{style:{color:'#1769d2',weight:5}}).addTo(map);
 routeLayers.push({routeKey:r.id,layer});map.fitBounds(layer.getBounds().pad(.1));
 $('#rvModal').close();
}
async function rvOpen(id){
 const r=rv.routes.find(x=>x.id===id);if(!r)return;
 const links=rvLinks(id).sort((a,b)=>a.orden-b.orden);
 const orders=links.map(m=>({m,p:cache.pedidos.find(p=>p.id===m.pedido_id)})).filter(x=>x.p);
 $('#rvTitle').textContent=rvName(r)+' · '+r.transportista;
 $('#rvDetails').innerHTML='<p>Origen y regreso: '+esc(DEPOT.name)+'</p><p>Recorrido completo: '+Number(r.distancia_km||0).toFixed(1)+' km · '+Math.round(r.duracion_min||0)+' min. Regreso: '+Number(r.retorno_km||0).toFixed(1)+' km · '+Math.round(r.retorno_min||0)+' min.</p><p>Diésel: '+rvMoney(r)+'</p><h3>Pedidos (desmarcar excluye del recorrido, no elimina el pedido)</h3>'+orders.map(x=>'<label class="rv-order"><input type="checkbox" data-rv-order="'+x.p.id+'" '+(x.m.incluido?'checked':'')+'> #'+esc(x.p.numero)+' · '+esc(nameOf('clientes',x.p.cliente_id))+'</label>').join('')+'<button id="rvSave">Guardar selección y recalcular</button><h3>Indicaciones</h3><ol class="rv-steps">'+(r.instrucciones||[]).map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol><button id="rvShowMap">Ver recorrido completo</button>';
 $('#rvSave').onclick=async()=>{
  const checked=new Set([...document.querySelectorAll('[data-rv-order]:checked')].map(x=>x.dataset.rvOrder));
  for(const x of orders){const {error}=await sb.from('ruta_pedidos').update({incluido:checked.has(x.p.id)}).eq('ruta_id',id).eq('pedido_id',x.p.id);if(error)return toast(error.message);}
  $('#rvModal').close();await rvLoad();await rvRecalc(id);
 };
 $('#rvShowMap').onclick=()=>rvDraw(r);
 $('#rvModal').showModal();
}
async function rvRecalc(id){
 const r=rv.routes.find(x=>x.id===id);if(!r)return;
 const orders=rvLinks(id).filter(m=>m.incluido).sort((a,b)=>a.orden-b.orden).map(m=>cache.pedidos.find(p=>p.id===m.pedido_id)).filter(Boolean);
 if(!orders.length){$('#rvMessage').textContent='La ruta no tiene paradas activas';return;}
 try{const data=await rvRoad(orders);const {error}=await sb.from('rutas').update({...data,consumo_l_100km:rv.consumption,precio_litro:rv.price}).eq('id',id);if(error)throw error;await rvLoad();}catch(e){toast(e.message);}
}
async function rvGenerate(optimize){
 const groups=new Map();
 cache.pedidos.filter(p=>p.fecha_entrega&&p.estado!=='ENTREGADO'&&!rvPickup(p)&&Number.isFinite(+p.latitud)&&Number.isFinite(+p.longitud)&&p.latitud!=null&&p.longitud!=null).forEach(p=>{
  const key=p.fecha_entrega+'|'+(p.transportista||'Sin asignar');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);
 });
 if(!groups.size)return toast('No hay pedidos con fecha y coordenadas; los retiros en depósito no se enrutan.');
 $('#rvMessage').textContent='Calculando y guardando recorridos con regreso a Pilar…';
 let count=0;
 for(const [key,orders] of groups){
  const [fecha,transportista]=key.split('|');
  const trips=optimize?packTrips(orders):[{orders}];
  for(let i=0;i<trips.length;i++){
   const trip=trips[i],viaje=i+1;
   if(trip.orders.some(p=>bultos(p)>310)){toast('Pedido superior a 310 bultos: dividir carga');continue;}
   try{
    const previous=await sb.from('rutas').select('*').eq('fecha',fecha).eq('transportista',transportista).eq('viaje',viaje).maybeSingle();
    if(previous.error)throw previous.error;
    if(previous.data?.estado==='REALIZADA')continue;
    const data=await rvRoad(trip.orders);
    const result=await sb.from('rutas').upsert({fecha,transportista,viaje,estado:'PLANIFICADA',...data,consumo_l_100km:rv.consumption,precio_litro:rv.price},{onConflict:'fecha,transportista,viaje'}).select('id').single();
    if(result.error)throw result.error;
    const old=await sb.from('ruta_pedidos').select('*').eq('ruta_id',result.data.id);if(old.error)throw old.error;
    const oldMap=new Map(old.data.map(m=>[m.pedido_id,m]));
    const newLinks=trip.orders.map((p,j)=>({ruta_id:result.data.id,pedido_id:p.id,orden:j,incluido:oldMap.get(p.id)?.incluido??true}));
    const saved=await sb.from('ruta_pedidos').upsert(newLinks,{onConflict:'ruta_id,pedido_id'});if(saved.error)throw saved.error;
    const keep=new Set(newLinks.map(x=>x.pedido_id));
    for(const m of old.data)if(!keep.has(m.pedido_id))await sb.from('ruta_pedidos').delete().eq('ruta_id',result.data.id).eq('pedido_id',m.pedido_id);
    count++;
   }catch(e){$('#rvMessage').textContent='Error en '+fecha+' / '+transportista+': '+e.message;return;}
  }
 }
 await rvLoad();$('#rvMessage').textContent=count+' rutas guardadas. Incluyen recorrido de regreso a Pilar.';
}
function rvInit(){
 const container=document.createElement('section');container.className='rv-section';
 container.innerHTML='<div class="rv-controls"><label>Transportista <select id="rvDriver"></select></label><label>Período <select id="rvPeriod"><option value="all">Todos</option><option value="past">Pasadas</option><option value="future">Futuras</option></select></label><label>Diésel (L/100 km) <input id="rvConsumption" type="number" min="0.1" step="0.1" value="12"></label><label>Precio/L ($) <input id="rvPrice" type="number" min="0" step="0.01" placeholder="Sin precio inicial"></label><button id="rvRefresh">Actualizar</button></div><p id="rvMessage" class="help">OSRM: estimaciones sin tráfico en vivo. Costo y duración incluyen regreso a Pilar.</p><h3>Rutas pasadas</h3><div class="rv-scroll"><table><thead><tr><th>Ruta</th><th>Transportista</th><th>Estado</th><th>Paradas</th><th>Km</th><th>Tiempo</th><th>Combustible</th><th>Acciones</th></tr></thead><tbody id="rvPast"></tbody></table></div><h3>Rutas futuras y de hoy</h3><div class="rv-scroll"><table><thead><tr><th>Ruta</th><th>Transportista</th><th>Estado</th><th>Paradas</th><th>Km</th><th>Tiempo</th><th>Combustible</th><th>Acciones</th></tr></thead><tbody id="rvFuture"></tbody></table></div><dialog id="rvModal"><header><h2 id="rvTitle"></h2><button id="rvClose">Cerrar ×</button></header><div id="rvDetails"></div></dialog>';
 $('#mapView .panel').append(container);
 const style=document.createElement('style');style.textContent='.rv-section{margin-top:20px}.rv-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.rv-controls label{display:flex;flex:1;min-width:135px;flex-direction:column;gap:5px}.rv-controls input,.rv-controls select{width:100%;min-width:0;padding:8px}.rv-scroll{overflow-x:auto;margin-bottom:18px}.rv-scroll table{width:100%;border-collapse:collapse;white-space:nowrap}.rv-scroll td,.rv-scroll th{padding:9px;border-bottom:1px solid #ddd;text-align:left}.rv-scroll button{margin:2px}#rvModal{width:min(900px,96vw);max-height:90vh;overflow:auto;border:0;border-radius:12px;padding:20px}#rvModal::backdrop{background:#0008}#rvModal header{display:flex;justify-content:space-between;align-items:center}.rv-order{display:block;padding:7px;border-bottom:1px solid #ddd}.rv-steps{max-height:300px;overflow:auto}@media(max-width:650px){.rv-controls{display:grid;grid-template-columns:1fr 1fr}.rv-controls label{min-width:0}}';document.head.append(style);
 const c=Number(localStorage.getItem('rvDieselConsumption'));if(c>0)rv.consumption=c;
 const p=localStorage.getItem('rvDieselPrice');if(p!==null&&p!==''&&Number(p)>=0)rv.price=Number(p);
 $('#rvConsumption').value=rv.consumption;$('#rvPrice').value=rv.price??'';
 $('#rvConsumption').onchange=e=>{const v=Number(e.target.value);if(v>0){rv.consumption=v;localStorage.setItem('rvDieselConsumption',v);}else e.target.value=rv.consumption;};
 $('#rvPrice').onchange=e=>{rv.price=e.target.value===''?null:Number(e.target.value);if(rv.price!==null&&(!Number.isFinite(rv.price)||rv.price<0)){rv.price=null;e.target.value='';}localStorage.setItem('rvDieselPrice',rv.price??'');rvRender();};
 $('#rvDriver').onchange=e=>{rv.driver=e.target.value;rvRender();};
 $('#rvPeriod').onchange=e=>{rv.period=e.target.value;rvRender();};
 $('#rvRefresh').onclick=rvLoad;$('#rvClose').onclick=()=>$('#rvModal').close();
 const oldSwitch=switchView;switchView=function(id){oldSwitch(id);if(id==='mapView')rvLoad();};
 $('#route').onclick=()=>rvGenerate(false);
 $('#optimizeRoutes').onclick=()=>rvGenerate(true);
}
rvInit();
