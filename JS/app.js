/* ============================================================
   PLANIFICADOR DE ENTREGAS V6
   Archivo: app.js

   ÍNDICE GENERAL
   01. Estado global y utilidades
   02. Inicio de sesión y autenticación
   03. Carga y sincronización con Supabase
   04. Selectores y filtros
   05. Cálculos y renderizado general
   06. Calendario y programación de entregas
   07. Tabla general de pedidos
   08. Tablas de clientes, vendedores y productos
   09. Alta y edición de clientes, vendedores y productos
   10. Detalle de productos del pedido
   11. Selector de productos
   12. Formulario de pedidos
   13. Impresión, eventos del formulario y geocodificación
   14. Guardado y eliminación de pedidos
   15. Configuración del mapa y estado de las rutas
   16. Cálculo de rutas viales (OSRM)
   17. Distribución de cargas y orden geográfico
   18. Navegación entre vistas y eventos
   19. Inicio de la aplicación
   ============================================================ */


/* ============================================================
   [01] ESTADO GLOBAL Y UTILIDADES
   ============================================================ */

const $ = s => document.querySelector(s);

function $$(sel) {
    return document.querySelectorAll(sel);
}

const cfg = window.APP_CONFIG || {};

const STATUS = [
    'PENDIENTE',
    'PROGRAMADO',
    'EN REPARTO',
    'ENTREGADO',
    'NO ENTREGADO'
];

let sb = null;
let user = null;

let cache = {
    clientes: [],
    vendedores: [],
    productos: [],
    pedidos: [],
    pedido_productos: []
};

let editOrderId = null;
let week = monday(new Date());

let map = null;
let markers = [];
let routeLayer = null;


/** Lunes de la semana de una fecha, a las 00:00:00. */
function monday(d) {
    d = new Date(d);
    const n = d.getDay();

    d.setDate(d.getDate() + (n === 0 ? -6 : 1 - n));
    d.setHours(0, 0, 0, 0);

    return d;
}


/** Fecha local a YYYY-MM-DD (sin desfase por zona horaria). */
function iso(d) {
    return new Date(
        d.getTime() - d.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);
}


/** Escapa HTML. */
function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}


/** Notificación temporal. */
function toast(t) {
    const e = $('#toast');

    e.textContent = t;
    e.classList.add('show');

    setTimeout(() => e.classList.remove('show'), 3500);
}


/** Importe en pesos argentinos. */
function money(v) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS'
    }).format(Number(v) || 0);
}


/** Precio en pesos argentinos para inputs de texto. */
function formatPrice(value) {
    return '$ ' + new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

/** Interpreta valores como "$ 13.200,50", "13200,50" o "13200.50". */
function parsePrice(value) {
    let s = String(value ?? '').replace(/[$\s]/g, '').trim();
    if (!s) return 0;
    if (s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
        s = s.replace(/\./g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}


/**
 * Convierte un valor a texto con punto decimal.
 * Sirve para cargar coordenadas en inputs type="number",
 * que no aceptan coma decimal.
 */
function toNum(v) {
    return String(v ?? '').replace(',', '.');
}


/**
 * Convierte texto (con coma o punto) a número.
 * Devuelve null si está vacío o no es válido.
 */
function numOrNull(v) {
    const s = String(v ?? '').trim().replace(',', '.');

    if (s === '') return null;

    const n = Number(s);

    return Number.isFinite(n) ? n : null;
}


/** Nombre de una entidad a partir de su ID. */
function nameOf(table, id) {
    return cache[table].find(x => x.id === id)?.nombre || '—';
}


/** Verifica la configuración de Supabase. */
function configured() {
    return cfg.SUPABASE_URL &&
        !cfg.SUPABASE_URL.includes('PEGAR_') &&
        cfg.SUPABASE_ANON_KEY &&
        !cfg.SUPABASE_ANON_KEY.includes('PEGAR_');
}


/* ============================================================
   [02] INICIO DE SESIÓN Y AUTENTICACIÓN
   ============================================================ */

async function start() {
    if (!configured()) {
        $('#connection').textContent = 'Falta configurar config.js';
        $('#loginPanel').style.display = 'block';
        $('#loginMsg').textContent =
            'Abrí config.js y pegá la URL y clave publicable de Supabase.';
        return;
    }

    sb = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
    );

    const { data: { session } } = await sb.auth.getSession();

    if (session) {
        user = session.user;
        showApp();
    } else {
        $('#loginPanel').style.display = 'block';
        $('#connection').dataset.state = 'offline';
        $('#connection').textContent = 'Sin sesión';
    }

    sb.auth.onAuthStateChange((_e, s) => {
        if (s) {
            user = s.user;
            showApp();
        } else {
            user = null;
            $('#app').classList.add('hidden');
            $('#loginPanel').style.display = 'block';
            $('#logout').classList.add('hidden');
        }
    });
}


$('#loginForm').onsubmit = async e => {
    e.preventDefault();

    $('#loginMsg').textContent = 'Ingresando…';

    const { error } = await sb.auth.signInWithPassword({
        email: $('#emailLogin').value,
        password: $('#passwordLogin').value
    });

    $('#loginMsg').textContent = error ? error.message : '';
};


$('#logout').onclick = () => sb.auth.signOut();


/* ============================================================
   [03] CARGA Y SINCRONIZACIÓN CON SUPABASE
   ============================================================ */

async function showApp() {
    $('#loginPanel').style.display = 'none';
    $('#app').classList.remove('hidden');
    $('#logout').classList.remove('hidden');

    $('#connection').dataset.state = 'connecting';
    $('#connection').textContent = 'Conectando…';

    try {
        await loadAll();

        $('#connection').dataset.state = 'connected';
        $('#connection').textContent = 'Conectado · ' + user.email;

        render();
        subscribeRealtime();
    } catch (e) {
        $('#connection').dataset.state = 'error';
        $('#connection').textContent = 'Error de conexión';

        toast(e.message);
    }
}


async function loadAll() {
    const tables = [
        'clientes',
        'vendedores',
        'productos',
        'pedidos',
        'pedido_productos'
    ];

    for (const t of tables) {
        let q = sb.from(t).select('*');

        if (t === 'pedidos') {
            q = q.order('fecha_pedido', { ascending: true });
        } else if (t !== 'pedido_productos') {
            q = q.order('nombre', { ascending: true });
        }

        const { data, error } = await q.limit(3000);

        if (error) throw error;

        cache[t] = data || [];
    }

    populateSelects();
}


let realtimeChannel = null;


function subscribeRealtime() {
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
    }

    realtimeChannel = sb
        .channel('planificador-v6-sync')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            () => {
                loadAll()
                    .then(render)
                    .catch(e => toast(
                        'Error al sincronizar: ' + e.message
                    ));
            }
        )
        .subscribe();
}


/* ============================================================
   [04] SELECTORES Y FILTROS
   ============================================================ */

function populateSelects() {
    const fill = (sel, rows, placeholder) => {
        const e = $(sel);
        const old = e.value;

        e.innerHTML =
            (placeholder
                ? `<option value="">${placeholder}</option>`
                : '') +
            rows
                .filter(x => x.activo !== false)
                .map(x =>
                    `<option value="${x.id}">${esc(x.nombre)}</option>`
                )
                .join('');

        if (rows.some(x => x.id === old)) {
            e.value = old;
        }
    };

    fill('#oClient', cache.clientes, 'Elegir cliente');
    fill('#oSeller', cache.vendedores, 'Sin asignar');
    fill('#filterSeller', cache.vendedores, 'Todos los vendedores');
}


function filtered() {
    return cache.pedidos.filter(p =>
        (!$('#filterSeller').value ||
            p.vendedor_id === $('#filterSeller').value) &&
        (!$('#filterDriver').value ||
            p.transportista === $('#filterDriver').value) &&
        (!$('#filterStatus').value ||
            p.estado === $('#filterStatus').value)
    );
}


/* ============================================================
   [05] CÁLCULOS Y RENDERIZADO GENERAL
   ============================================================ */

function orderProducts(id) {
    return cache.pedido_productos.filter(x => x.pedido_id === id);
}


function lineTotal(x) {
    return (+x.cantidad || 0) *
        (+x.precio_unitario || 0) *
        (1 - (+x.descuento_pct || 0) / 100);
}


function orderTotal(p) {
    return orderProducts(p.id).reduce(
        (a, x) => a + lineTotal(x),
        0
    );
}


function render() {
    const a = filtered();

    $('#stats').innerHTML = [
        [
            'Sin programar',
            a.filter(p =>
                !p.fecha_entrega &&
                !['ENTREGADO', 'NO ENTREGADO'].includes(p.estado)
            ).length
        ],
        [
            'Programados',
            a.filter(p =>
                p.fecha_entrega &&
                ['PROGRAMADO', 'EN REPARTO'].includes(p.estado)
            ).length
        ],
        [
            'Entregados',
            a.filter(p => p.estado === 'ENTREGADO').length
        ],
        ['Pedidos', a.length]
    ].map(([x, n]) =>
        `<div class="stat"><span>${x}</span><strong>${n}</strong></div>`
    ).join('');

    renderCalendar();
    renderOrders();
    renderClients();
    renderSellers();
    renderProducts();

    if (map) drawMap();
}


/* ============================================================
   [06] CALENDARIO Y PROGRAMACIÓN DE ENTREGAS
   ============================================================ */


const uiCalendarOrder=new Map(),uiTableSort=new Map();
function orderedCards(items,date){const order=uiCalendarOrder.get(date??'backlog')||[];return [...items].sort((a,b)=>{const ia=order.indexOf(String(a.id)),ib=order.indexOf(String(b.id));return (ia<0?Infinity:ia)-(ib<0?Infinity:ib);});}
function rememberCardOrder(zone,date){uiCalendarOrder.set(date??'backlog',[...zone.querySelectorAll(':scope > .order')].map(n=>n.dataset.orderId));}
function enableTableSorting(id){
 const table=document.getElementById(id)?.querySelector('table');if(!table)return;
 const headers=[...table.querySelectorAll('thead th')];
 const compare=(x,y)=>{
  const parse=s=>{s=s.trim();if(/^\\d{4}-\\d{2}-\\d{2}/.test(s))return Date.parse(s);if(/^\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test(s)){const m=s.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);return Date.parse(m[3]+'-'+m[2]+'-'+m[1]);}if(/^[\\s$€\\d.,-]+$/.test(s)&&/\\d/.test(s))return Number(s.replace(/[^\\d,.-]/g,'').replace(/\\./g,'').replace(',','.'));return null;};
  const a=parse(x),b=parse(y);return a!==null&&b!==null&&Number.isFinite(a)&&Number.isFinite(b)?a-b:x.localeCompare(y,'es',{numeric:true,sensitivity:'base'});
 };
 const apply=()=>{const s=uiTableSort.get(id);if(!s)return;const body=table.tBodies[0];[...body.rows].sort((a,b)=>s.direction*compare(a.cells[s.column]?.textContent||'',b.cells[s.column]?.textContent||'')).forEach(row=>body.append(row));headers.forEach((th,i)=>{const btn=th.querySelector('.ui-sort-btn');if(btn)btn.textContent=btn.dataset.label+(i===s.column?(s.direction===1?' ▲':' ▼'):' ↕');th.setAttribute('aria-sort',i===s.column?(s.direction===1?'ascending':'descending'):'none');});};
 headers.slice(0,-1).forEach((th,i)=>{const label=th.textContent.trim();th.textContent='';const btn=document.createElement('button');btn.type='button';btn.className='ui-sort-btn';btn.dataset.label=label;btn.textContent=label+' ↕';btn.onclick=()=>{const old=uiTableSort.get(id);uiTableSort.set(id,{column:i,direction:old?.column===i?-old.direction:1});apply();};th.append(btn);});
 apply();
}

function orderCard(p) {
    const c = cache.clientes.find(x => x.id === p.cliente_id) || {};

    const e = document.createElement('article');
    e.className = 'order ' + p.estado.replaceAll(' ', '-');
    e.draggable = true;
    e.dataset.orderId=String(p.id);
    e.setAttribute('aria-label', `Pedido ${p.numero}, arrastrar para cambiar fecha`);

    e.innerHTML = `
        <b>#${esc(p.numero)}</b>
        <span class="badge">${esc(p.estado)}</span>
        <div>${esc(c.nombre || 'Cliente')}</div>
        <small>
            ${esc(p.localidad_entrega || c.localidad || 'Sin localidad')}
            · ${orderProducts(p.id).length} productos
        </small>
        <small>
            ${esc(p.transportista || 'Sin transportista')}
            · ${esc(nameOf('vendedores', p.vendedor_id))}
        </small>
    `;

    e.ondragstart = ev => {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', p.id);
        requestAnimationFrame(() => e.classList.add('dragging'));
    };
    e.ondragend = () => {
        e.classList.remove('dragging');
        document.querySelectorAll('.drop.over').forEach(z => z.classList.remove('over'));
    };

    e.ondblclick = () => editOrder(p.id);

    return e;
}


/**
 * Zona que acepta pedidos arrastrados.
 * date: YYYY-MM-DD programa la entrega; null la quita.
 */
function dropZone(el, date) {
    el.ondragover = e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('over');
    };

    el.ondragleave = e => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('over');
    };

    el.ondrop = async e => {
        e.preventDefault();
        el.classList.remove('over');

        const id = e.dataTransfer.getData('text/plain');
        const p = cache.pedidos.find(x => x.id === id);

        if (!p) return;
        if ((p.fecha_entrega || null) === date) {
            const target=e.target.closest('.order');
            const card=[...el.querySelectorAll(':scope > .order')].find(n=>n.dataset.orderId===String(id));
            if(card && target && target!==card && el.contains(target)) {
                const rect=target.getBoundingClientRect();
                el.insertBefore(card,e.clientY<rect.top+rect.height/2?target:target.nextSibling);
                rememberCardOrder(el,date);
            } else if(card && !target) {el.append(card);rememberCardOrder(el,date);}
            return;
        }
        el.classList.add('saving');
        const { error } = await sb
            .from('pedidos')
            .update({
                fecha_entrega: date,
                estado: todayStatus(
                    date,
                    date === iso(new Date())
                        ? 'EN REPARTO'
                        : (date ? 'PROGRAMADO' : 'PENDIENTE')
                )
            })
            .eq('id', id);

        el.classList.remove('saving');
        if (error) {
            toast('No se pudo mover el pedido: ' + error.message);
            return;
        }

        await loadAll();
        render();
        toast(date ? 'Pedido reprogramado para ' + date : 'Pedido devuelto a pendientes');
    };
}


function renderCalendar() {
    const a = filtered();
    const back = $('#backlog');

    back.innerHTML = '';

    const un = a.filter(p =>
        !p.fecha_entrega &&
        !['NO ENTREGADO'].includes(p.estado)
    );

    $('#backlogCount').textContent = `(${un.length})`;

    orderedCards(un,null).forEach(p => back.append(orderCard(p)));
    dropZone(back, null);

    const cal = $('#calendar');
    cal.innerHTML = '';

    const days = [
        'Lunes', 'Martes', 'Miércoles', 'Jueves',
        'Viernes', 'Sábado', 'Domingo'
    ];

    const end = new Date(week);
    end.setDate(end.getDate() + 6);

    $('#week').textContent =
        week.toLocaleDateString('es-AR') +
        ' — ' +
        end.toLocaleDateString('es-AR');

    for (let i = 0; i < 7; i++) {
        const d = new Date(week);
        d.setDate(d.getDate() + i);

        const col = document.createElement('div');
        col.className = 'day';

        col.innerHTML = `
            <div class="day-head">
                <span>${days[i]}</span>
                <span>${d.getDate()}/${d.getMonth() + 1}</span><button type="button" class="ui-day-sort">Ordenar</button>
            </div>
            <div class="drop"></div>
        `;

        const z = col.querySelector('.drop');

        orderedCards(a.filter(p => p.fecha_entrega === iso(d)),iso(d))
            .forEach(p => z.append(orderCard(p)));
        col.querySelector('.ui-day-sort').onclick=()=>{
            const cards=[...z.querySelectorAll(':scope > .order')];
            cards.sort((x,y)=>Number(x.querySelector('b').textContent.replace(/[^0-9]/g,''))-Number(y.querySelector('b').textContent.replace(/[^0-9]/g,'')));
            cards.forEach(card=>z.append(card));rememberCardOrder(z,iso(d));
        };

        dropZone(z, iso(d));
        cal.append(col);
    }
}


/* ============================================================
   [07] TABLA GENERAL DE PEDIDOS
   ============================================================ */

function renderOrders() {
    const rows = filtered();

    $('#ordersTable').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Vendedor</th>
                    <th>Fecha entrega</th>
                    <th>Estado</th>
                    <th>Transportista</th>
                    <th>Productos</th>
                    <th>Bultos</th>
                    <th>Total</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(p => `
                    <tr>
                        <td>${esc(p.numero)}</td>
                        <td>${esc(nameOf('clientes', p.cliente_id))}</td>
                        <td>${esc(nameOf('vendedores', p.vendedor_id))}</td>
                        <td>${esc(p.fecha_entrega || '—')}</td>
                        <td>${esc(p.estado)}</td>
                        <td>${esc(p.transportista || '—')}</td>
                        <td>${orderProducts(p.id).length}</td>
                        <td><strong>${bultos(p).toLocaleString('es-AR')}</strong></td>
                        <td>${money(orderTotal(p))}</td>
                        <td>
                            <button data-edit-order="${p.id}">Editar</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    enableTableSorting('ordersTable');
    $('#ordersTable')
        .querySelectorAll('[data-edit-order]')
        .forEach(b => {
            b.onclick = () => editOrder(b.dataset.editOrder);
        });
}


/* ============================================================
   [08] TABLAS DE CLIENTES, VENDEDORES Y PRODUCTOS
   ============================================================ */

function renderClients() {
    const cols = [
        ['id', 'ID'],
        ['codigo', 'Código'],
        ['nombre', 'Nombre'],
        ['contacto', 'Contacto'],
        ['telefono', 'Teléfono'],
        ['email', 'Email'],
        ['direccion', 'Dirección fiscal/comercial'],
        ['direccion_entrega', 'Dirección de entrega'],
        ['localidad', 'Localidad'],
        ['provincia', 'Provincia'],
        ['codigo_postal', 'Código postal'],
        ['latitud', 'Latitud'],
        ['longitud', 'Longitud'],
        ['observaciones', 'Observaciones'],
        ['activo', 'Activo'],
        ['created_at', 'Creado'],
        ['updated_at', 'Actualizado']
    ];

    $('#clientsTable').innerHTML = `
        <table class="client-table">
            <thead>
                <tr>
                    ${cols.map(c => `<th>${c[1]}</th>`).join('')}
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${cache.clientes.map(c => `
                    <tr>
                        ${cols.map(([k]) => `
                            <td>${
                                k === 'activo'
                                    ? (c[k] ? 'Sí' : 'No')
                                    : k.endsWith('_at')
                                        ? (c[k]
                                            ? new Date(c[k]).toLocaleString('es-AR')
                                            : '—')
                                        : esc(c[k] ?? '—')
                            }</td>
                        `).join('')}
                        <td>
                            <button data-entity="clientes" data-id="${c.id}">
                                Editar
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    enableTableSorting('clientsTable');
    wireEntityButtons();
}


function renderSellers() {
    $('#sellersTable').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Código</th>
                    <th>Vendedor</th>
                    <th>Teléfono</th>
                    <th>Email</th>
                    <th>Activo</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${cache.vendedores.map(c => `
                    <tr>
                        <td>${esc(c.codigo)}</td>
                        <td>${esc(c.nombre)}</td>
                        <td>${esc(c.telefono)}</td>
                        <td>${esc(c.email)}</td>
                        <td>${c.activo ? 'Sí' : 'No'}</td>
                        <td>
                            <button data-entity="vendedores" data-id="${c.id}">
                                Editar
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    enableTableSorting('sellersTable');
    wireEntityButtons();
}


function renderProducts() {
    $('#productsTable').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Activo</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${cache.productos.map(c => `
                    <tr>
                        <td>${esc(c.codigo)}</td>
                        <td>${esc(c.nombre)}</td>
                        <td>${c.activo ? 'Sí' : 'No'}</td>
                        <td>
                            <button data-entity="productos" data-id="${c.id}">
                                Editar
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    enableTableSorting('productsTable');
    wireEntityButtons();
}


function wireEntityButtons() {
    document.querySelectorAll('[data-entity]').forEach(b => {
        b.onclick = () => editEntity(
            b.dataset.entity,
            b.dataset.id
        );
    });
}


/* ============================================================
   [09] ALTA Y EDICIÓN DE CLIENTES, VENDEDORES Y PRODUCTOS
   ============================================================ */

// [nombreColumna, etiqueta, tipoHTML, obligatorio]
const fields = {
    clientes: [
        ['codigo', 'Código', 'text'],
        ['nombre', 'Nombre comercial', 'text', true],
        ['contacto', 'Contacto', 'text'],
        ['telefono', 'Teléfono', 'text'],
        ['email', 'Email', 'email'],
        ['direccion', 'Dirección fiscal/comercial', 'text'],
        ['direccion_entrega', 'Dirección de entrega', 'text'],
        ['localidad', 'Localidad', 'text'],
        ['provincia', 'Provincia', 'text'],
        ['codigo_postal', 'Código postal', 'text'],
        ['latitud', 'Latitud', 'number'],
        ['longitud', 'Longitud', 'number'],
        ['observaciones', 'Observaciones', 'text'],
        ['activo', 'Activo', 'checkbox']
    ],
    vendedores: [
        ['codigo', 'Código', 'text'],
        ['nombre', 'Nombre', 'text', true],
        ['telefono', 'Teléfono', 'text'],
        ['email', 'Email', 'email'],
        ['activo', 'Activo', 'checkbox']
    ],
    productos: [
        ['codigo', 'Código', 'text'],
        ['nombre', 'Nombre', 'text', true],
        ['descripcion', 'Descripción', 'text'],
        ['precio', 'Precio unitario', 'number'],
        ['activo', 'Activo', 'checkbox']
    ]
};


function editEntity(type, id = null) {
    const row = id
        ? cache[type].find(x => x.id === id)
        : {};

    $('#entityType').value = type;
    $('#entityId').value = id || '';

    $('#entityTitle').textContent =
        (id ? 'Editar ' : 'Nuevo ') +
        ({
            clientes: 'cliente',
            vendedores: 'vendedor',
            productos: 'producto'
        }[type]);

    $('#entityFields').innerHTML = fields[type].map(
        ([key, label, t, req]) => `
            <label class="${key === 'observaciones' ? 'full' : ''}">
                ${label}
                <input
                    data-field="${key}"
                    type="${t}"
                    ${t === 'number' ? 'step="any"' : ''}
                    ${req ? 'required' : ''}
                    ${t === 'checkbox'
                        ? ''
                        : `value="${esc(
                            t === 'number'
                                ? toNum(row[key])
                                : (row[key] ?? (key === 'provincia'
                                    ? 'Buenos Aires'
                                    : ''))
                        )}"`}
                    ${t === 'checkbox' && row[key] !== false
                        ? 'checked'
                        : ''}
                >
            </label>
        `
    ).join('') + (
        type === 'clientes'
            ? `<div class="full">
                <button type="button" id="geoClient">
                    Buscar coordenadas desde la dirección
                </button>
                <span id="entityGeoMsg" class="muted"></span>
               </div>`
            : ''
    );

    if (type === 'clientes') {
        $('#geoClient').onclick = async () => {
            const v = k =>
                $('#entityFields [data-field="' + k + '"]');

            const q = [
                v('direccion_entrega').value ||
                    v('direccion').value,
                v('localidad').value,
                v('provincia').value,
                'Argentina'
            ].filter(Boolean).join(', ');

            $('#entityGeoMsg').textContent = 'Buscando…';

            try {
                const j = await fetch(
                    'https://nominatim.openstreetmap.org/search' +
                    '?format=jsonv2&limit=1&countrycodes=ar&q=' +
                    encodeURIComponent(q)
                ).then(r => r.json());

                if (!j.length) {
                    throw Error('Dirección no encontrada');
                }

                v('latitud').value = j[0].lat;
                v('longitud').value = j[0].lon;
                $('#entityGeoMsg').textContent = j[0].display_name;
            } catch (e) {
                $('#entityGeoMsg').textContent = e.message;
            }
        };
    }

    $('#entityDlg').showModal();
}


$('#entityForm').onsubmit = async e => {
    e.preventDefault();

    const type = $('#entityType').value;
    const id = $('#entityId').value;
    const data = {};

    fields[type].forEach(([key, , t]) => {
        const el = $('#entityFields [data-field="' + key + '"]');

        if (t === 'checkbox') {
            data[key] = el.checked;
        } else if (t === 'number') {
            // Acepta coma o punto decimal.
            data[key] = numOrNull(el.value);
        } else {
            data[key] = el.value.trim() || null;
        }
    });

    if (type === 'productos' && data.precio == null) {
        data.precio = 0;
    }

    const q = id
        ? sb.from(type).update(data).eq('id', id)
        : sb.from(type).insert(data);

    const { error } = await q;

    if (error) {
        toast(error.message);
        return;
    }

    $('#entityDlg').close();

    await loadAll();
    render();

    toast('Registro guardado');
};


$('#cancelEntity').onclick = () => $('#entityDlg').close();


/* ============================================================
   [10] DETALLE DE PRODUCTOS DEL PEDIDO
   ============================================================ */

function addProductLine(p = {}) {
    const row = document.createElement('div');
    row.className = 'product-line';

    const pr = cache.productos.find(
        x => x.id === p.producto_id
    ) || {};

    row.innerHTML = `
        <input
            class="line-qty"
            type="number"
            min="0.001"
            step="0.001"
            value="${p.cantidad ?? 1}"
            required
            title="Cantidad / bultos"
        >

        <select class="line-product" required title="Código">
            <option value="">Cod.</option>
            ${cache.productos
                .filter(x => x.activo)
                .map(x => `
                    <option value="${x.id}">
                        ${esc(x.codigo || '')}
                    </option>
                `).join('')}
        </select>

        <span class="line-desc">${esc(pr.nombre || '')}</span>

        <input
            class="line-price"
            type="text"
            inputmode="decimal"
            value="${p.precio_unitario == null ? '' : formatPrice(p.precio_unitario)}"
            required
            title="Precio final unitario"
        >

        <input
            class="line-discount"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value="${p.descuento_pct ?? 0}"
            title="Descuento porcentual"
        >

        <span class="line-total">${money(lineTotal(p))}</span>

        <button type="button" class="danger no-print">×</button>
    `;

    $('#productLines').append(row);

    row.querySelector('.line-product').value =
        p.producto_id || '';

    const updateName = () => {
        const product = cache.productos.find(
            x => x.id === row.querySelector('.line-product').value
        );

        row.querySelector('.line-desc').textContent =
            product?.nombre || '';

        if (product && row.querySelector('.line-price').value === '') {
            row.querySelector('.line-price').value =
                formatPrice(product.precio || 0);
        }

        calcTotal();
    };

    row.querySelector('.line-product').onchange = updateName;

    row.querySelectorAll('input').forEach(x => {
        x.oninput = calcTotal;
    });

    const priceInput = row.querySelector('.line-price');
    priceInput.addEventListener('focus', () => {
        priceInput.value = String(parsePrice(priceInput.value)).replace('.', ',');
        priceInput.select();
    });
    priceInput.addEventListener('blur', () => {
        priceInput.value = formatPrice(parsePrice(priceInput.value));
        calcTotal();
    });

    row.querySelector('button').onclick = () => {
        row.remove();
        calcTotal();
    };

    calcTotal();
}


function calcTotal() {
    let total = 0;
    let qty = 0;

    document.querySelectorAll('.product-line').forEach(r => {
        const q = +r.querySelector('.line-qty').value || 0;
        const price = parsePrice(r.querySelector('.line-price').value);

        const disc = Math.min(
            100,
            Math.max(
                0,
                +r.querySelector('.line-discount').value || 0
            )
        );

        const subtotal = q * price * (1 - disc / 100);

        total += subtotal;
        qty += q;

        r.querySelector('.line-total').textContent = money(subtotal);
    });

    $('#orderTotal').textContent = money(total);

    $('#unitsTotal').textContent =
        new Intl.NumberFormat('es-AR', {
            maximumFractionDigits: 3
        }).format(qty) + ' # Bultos';
}


/** Dirección preferida de un cliente (entrega antes que comercial). */
function cDeliveryAddress(clientId) {
    const c = cache.clientes.find(x => x.id === clientId);

    return c?.direccion_entrega || c?.direccion || '';
}


/* ============================================================
   [11] SELECTOR DE PRODUCTOS
   ============================================================ */

function openProductPicker() {
    const list = $('#productPickerList');

    list.innerHTML = cache.productos
        .filter(p => p.activo)
        .map(p => `
            <label class="picker-item">
                <input type="checkbox" value="${p.id}">
                <span>
                    <b>${esc(p.codigo || '')}</b>
                    · ${esc(p.nombre)}
                    <small>Precio: ${money(p.precio)}</small>
                </span>
            </label>
        `).join('');

    $('#productSearch').value = '';
    $('#productPickerDlg').showModal();
}


$('#closeProductPicker').onclick = () => {
    $('#productPickerDlg').close();
};


$('#productSearch').oninput = () => {
    const q = $('#productSearch').value.toLocaleLowerCase();

    $('#productPickerList')
        .querySelectorAll('.picker-item')
        .forEach(el => {
            el.style.display =
                el.textContent.toLocaleLowerCase().includes(q)
                    ? ''
                    : 'none';
        });
};


$('#selectAllProducts').onclick = () => {
    $('#productPickerList')
        .querySelectorAll('input[type=checkbox]')
        .forEach(x => x.checked = true);
};


$('#confirmProducts').onclick = () => {
    const chosen = [
        ...$('#productPickerList').querySelectorAll('input:checked')
    ].map(x => x.value);

    chosen.forEach(id => {
        const alreadyAdded = [
            ...$('#productLines').querySelectorAll('.line-product')
        ].some(s => s.value === id);

        if (alreadyAdded) return;

        const pr = cache.productos.find(x => x.id === id);

        addProductLine({
            producto_id: id,
            cantidad: 1,
            precio_unitario: pr?.precio || 0,
            descuento_pct: 0
        });
    });

    $('#productPickerDlg').close();

    if (!chosen.length) {
        toast('No seleccionaste productos');
    }
};


/* ============================================================
   [12] FORMULARIO DE PEDIDOS
   ============================================================ */

/**
 * Completa dirección, localidad, provincia y coordenadas
 * cuando se selecciona un cliente.
 */
function clientChanged() {
    const c = cache.clientes.find(
        x => x.id === $('#oClient').value
    );

    if (!c) return;

    $('#oAddress').value =
        c.direccion_entrega || c.direccion || '';

    $('#oLocality').value = c.localidad || '';
    $('#oProvince').value = c.provincia || 'Buenos Aires';
    $('#oLat').value = toNum(c.latitud);
    $('#oLng').value = toNum(c.longitud);

    $('#geoMsg').textContent =
        'Datos completados desde la ficha del cliente';
}


function nextOrderNumber() {
    return String(
        Math.max(
            0,
            ...cache.pedidos.map(p =>
                /^\d+$/.test(String(p.numero))
                    ? Number(p.numero)
                    : 0
            )
        ) + 1
    );
}


function todayStatus(date, status) {
    if (
        date === iso(new Date()) &&
        status !== 'ENTREGADO' &&
        status !== 'NO ENTREGADO'
    ) {
        return 'EN REPARTO';
    }

    if (status === 'EN REPARTO' && date !== iso(new Date())) {
        return date ? 'PROGRAMADO' : 'PENDIENTE';
    }

    return status;
}


function newOrder() {
    editOrderId = null;

    $('#orderTitle').textContent = 'Nuevo pedido';
    $('#orderForm').reset();

    $('#oNumber').value = nextOrderNumber();
    $('#oDate').value = iso(new Date());
    $('#oStatus').value = 'PENDIENTE';
    $('#oPayment').value = 'Contado';
    $('#oProvince').value = 'Buenos Aires';

    $('#productLines').innerHTML = '';

    $('#deleteOrder').classList.add('hidden');

    populateSelects();
    updatePrintDetails();

    $('#orderDlg').showModal();
}


async function editOrder(id) {
    const p = cache.pedidos.find(x => x.id === id);

    if (!p) return;

    editOrderId = id;

    $('#orderTitle').textContent = 'Editar pedido #' + p.numero;

    populateSelects();

    $('#oNumber').value = p.numero;
    $('#oClient').value = p.cliente_id;
    $('#oSeller').value = p.vendedor_id || '';
    $('#oDate').value = p.fecha_pedido || '';
    $('#oDelivery').value = p.fecha_entrega || '';
    $('#oDriver').value = p.transportista || '';
    $('#oStatus').value = p.estado;
    $('#oPayment').value = p.tipo_pago || 'Contado';

    $('#printOrderMeta').textContent =
        'Pedido #' + p.numero +
        ' · ' + (p.fecha_pedido || '') +
        ' · ' + nameOf('clientes', p.cliente_id);

    $('#oAddress').value =
        p.direccion_entrega ||
        cDeliveryAddress(p.cliente_id) ||
        '';

    $('#oLocality').value = p.localidad_entrega || '';
    $('#oProvince').value = p.provincia_entrega || 'Buenos Aires';
    $('#oLat').value = toNum(p.latitud);
    $('#oLng').value = toNum(p.longitud);
    $('#oNotes').value = p.observaciones || '';

    $('#productLines').innerHTML = '';

    orderProducts(id).forEach(addProductLine);

    $('#deleteOrder').classList.remove('hidden');

    updatePrintDetails();
    $('#orderDlg').showModal();
}


/* ============================================================
   [13] IMPRESIÓN, EVENTOS DEL FORMULARIO Y GEOCODIFICACIÓN
   ============================================================ */

$('#oClient').onchange = () => {
    clientChanged();
    updatePrintDetails();
};

$('#oPayment').onchange = updatePrintDetails;
$('#oDelivery').addEventListener('change', updatePrintDetails);


function updatePrintDetails() {
    const c = cache.clientes.find(
        x => x.id === $('#oClient').value
    ) || {};

    $('#printOrderTitle').textContent = `PEDIDO N.º ${$('#oNumber').value || '—'}`;
    $('#printOrderMeta').textContent =
        `Pedido #${$('#oNumber').value || '—'} · ` +
        `Fecha: ${$('#oDate').value || '—'}`;

    $('#printOrderDetails').innerHTML = `
        <span><b>Cliente:</b> ${esc(c.nombre || '—')}</span>
        <span><b>CUIT/Código:</b> ${esc(c.codigo || '—')}</span>
        <span><b>Dirección:</b> ${esc($('#oAddress').value || '—')}</span>
        <span><b>Localidad:</b> ${esc($('#oLocality').value || '—')},
            ${esc($('#oProvince').value || '')}</span>
        <span><b>Entrega:</b>
            ${esc($('#oDelivery').value || 'Sin programar')}</span>
        <span><b>Pago:</b> ${esc($('#oPayment').value || 'Contado')}</span>
        <span><b>Vendedor:</b>
            ${esc(nameOf('vendedores', $('#oSeller').value))}</span>
        <span><b>Transportista:</b>
            ${esc($('#oDriver').value || 'Sin asignar')}</span>
    `;
}


$('#oDelivery').onchange = () => {
    if (
        $('#oDelivery').value === iso(new Date()) &&
        $('#oStatus').value !== 'ENTREGADO' &&
        $('#oStatus').value !== 'NO ENTREGADO'
    ) {
        $('#oStatus').value = 'EN REPARTO';
    } else if (
        $('#oStatus').value === 'EN REPARTO' &&
        $('#oDelivery').value !== iso(new Date())
    ) {
        $('#oStatus').value =
            $('#oDelivery').value ? 'PROGRAMADO' : 'PENDIENTE';
    }
};


/**
 * Comprobante comercial A4 en ventana independiente.
 * El título se usa como nombre sugerido por la mayoría de navegadores
 * al seleccionar «Guardar como PDF» (no puede imponerse desde JavaScript).
 */
function printProfessionalOrder() {
    const get = selector => $(selector)?.value?.trim() || '';
    const client = cache.clientes.find(c => String(c.id) === get('#oClient')) || {};
    const numero = get('#oNumber') || 'SinNumero';
    const cliente = client.nombre || 'SinCliente';
    const safePart = value => String(value).normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'SinDato';
    const fileName = `Pedido${safePart(numero)}-${safePart(cliente)}`;
    const dateAR = value => {
        if (!value) return 'Sin programar';
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
    };
    const detail = (label, value) => `
        <div class="detail"><div class="label">${esc(label)}</div>
        <div class="value">${esc(value || '—')}</div></div>`;
    const deliveryAddress = [get('#oAddress'), get('#oLocality'), get('#oProvince')]
        .filter(Boolean).join(', ');
    // La dirección comercial/fiscal del cliente NO se reemplaza por la de entrega.
    const billingAddress = [client.direccion, client.localidad, client.provincia,
        client.codigo_postal].filter(Boolean).join(', ');
    const lines = [...document.querySelectorAll('#productLines .product-line')].map(row => {
        const productId = row.querySelector('.line-product')?.value;
        const product = cache.productos.find(p => String(p.id) === String(productId));
        const cantidad = Number(row.querySelector('.line-qty')?.value) || 0;
        const precio = parsePrice(row.querySelector('.line-price')?.value);
        const descuento = Math.max(0, Math.min(100,
            Number(row.querySelector('.line-discount')?.value) || 0));
        return { descripcion: product?.nombre || row.querySelector('.line-desc')?.textContent || '—',
            cantidad, precio, descuento,
            total: cantidad * precio * (1 - descuento / 100) };
    });
    if (!client.id || !lines.length) {
        toast('Seleccioná un cliente y al menos un producto para imprimir');
        return;
    }
    const total = lines.reduce((sum, line) => sum + line.total, 0);
    const qty = lines.reduce((sum, line) => sum + line.cantidad, 0);
    const quantity = n => n.toLocaleString('es-AR', {maximumFractionDigits: 3});
    const rows = lines.map((line, i) => `<tr>
        <td class="center">${i + 1}</td>
        <td class="description">${esc(line.descripcion)}</td>
        <td class="right">${quantity(line.cantidad)}</td>
        <td class="right">${money(line.precio)}</td>
        <td class="right">${quantity(line.descuento)} %</td>
        <td class="right strong">${money(line.total)}</td>
    </tr>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>${esc(fileName)}</title><style>
    @page { size:A4; margin:13mm 14mm 15mm; }
    * { box-sizing:border-box; }
    body { margin:0; color:#172534; background:#fff;
        font-family:Arial,Helvetica,sans-serif; font-size:10px; line-height:1.45; }
    .header { display:flex; align-items:flex-start; justify-content:space-between;
        gap:20px; padding:0 0 17px; border-bottom:3px solid #ed7900; }
    .brand { color:#ed7900; font-size:22px; font-weight:900; letter-spacing:.5px; }
    .brand-sub { color:#526173; font-size:10px; letter-spacing:1.3px; }
    .document-title { text-align:right; }
    .document-title h1 { margin:0; font-size:21px; color:#172534; }
    .document-title .number { color:#ed7900; font-size:14px; font-weight:800; margin-top:3px; }
    .document-title .date { color:#526173; margin-top:3px; }
    .section-title { margin:18px 0 8px; font-size:10px; color:#ed7900;
        font-weight:800; text-transform:uppercase; letter-spacing:1.1px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 18px; }
    .detail { min-width:0; }
    .label { color:#64748b; font-size:9px; text-transform:uppercase; letter-spacing:.5px; }
    .value { font-weight:650; font-size:11px; overflow-wrap:anywhere; white-space:pre-wrap; }
    .address-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .address-card { border:1px solid #dce4ed; background:#f8fafc;
        padding:11px 12px; border-radius:6px; min-width:0; }
    .address-card .value { font-weight:500; margin-top:5px; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    thead { display:table-header-group; }
    th { padding:9px 6px; background:#172534; color:white; font-size:9px; text-align:left; }
    td { padding:9px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
    tbody tr:nth-child(even) { background:#f8fafc; }
    tr { break-inside:avoid; page-break-inside:avoid; }
    .description { overflow-wrap:anywhere; white-space:normal; }
    .right { text-align:right; white-space:nowrap; }
    .center { text-align:center; }
    .strong { font-weight:700; }
    .summary { margin-top:15px; display:flex; justify-content:flex-end; }
    .summary-box { width:265px; max-width:100%; border-top:2px solid #ed7900; padding-top:10px; }
    .summary-line { display:flex; justify-content:space-between; gap:15px; padding:5px 0; }
    .grand-total { border-top:1px solid #dce4ed; margin-top:5px; padding-top:10px;
        font-size:15px; font-weight:800; }
    .notes { margin-top:20px; border-top:1px solid #dce4ed; padding-top:12px;
        white-space:pre-wrap; overflow-wrap:anywhere; }
    .footer { margin-top:25px; border-top:1px solid #dce4ed; padding-top:8px;
        font-size:9px; color:#64748b; display:flex; justify-content:space-between; }
    @media screen { body { max-width:210mm; margin:25px auto; padding:14mm;
        box-shadow:0 4px 25px #0002; } }
    @media print { body { padding:0; box-shadow:none; }
        * { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
    </style></head><body>
    <header class="header"><div><div class="brand">WAIPARA</div>
        <div class="brand-sub">DISTRIBUIDORA</div></div>
        <div class="document-title"><h1>COMPROBANTE DE PEDIDO</h1>
        <div class="number">PEDIDO N.º ${esc(numero)}</div>
        <div class="date">Fecha: ${esc(dateAR(get('#oDate')))}</div></div></header>
    <div class="section-title">Información del pedido</div>
    <div class="grid">
        ${detail('Cliente', cliente)}
        ${detail('Código de cliente', client.codigo)}
        ${detail('Vendedor', nameOf('vendedores', get('#oSeller')))}
        ${detail('Transportista', get('#oDriver') || 'Sin asignar')}
        ${detail('Fecha de entrega', dateAR(get('#oDelivery')))}
        ${detail('Condición de pago', get('#oPayment'))}
        ${detail('Estado', get('#oStatus'))}
        ${detail('Contacto', client.contacto || client.telefono)}
    </div>
    <div class="section-title">Direcciones</div>
    <div class="address-grid">
        <div class="address-card">${detail('Dirección de facturación', billingAddress || 'No informada en la ficha del cliente')}</div>
        <div class="address-card">${detail('Dirección de entrega', deliveryAddress || 'No informada')}</div>
    </div>
    <div class="section-title">Detalle de productos</div>
    <table><colgroup><col style="width:5%"><col style="width:43%">
        <col style="width:10%"><col style="width:15%"><col style="width:10%">
        <col style="width:17%"></colgroup>
        <thead><tr><th>#</th><th>Descripción</th><th class="right">Bultos</th>
        <th class="right">Precio</th><th class="right">Desc.</th>
        <th class="right">Importe</th></tr></thead>
        <tbody>${rows}</tbody></table>
    <div class="summary"><div class="summary-box">
        <div class="summary-line"><span>Total de bultos</span><b>${quantity(qty)}</b></div>
        <div class="summary-line grand-total"><span>TOTAL</span><span>${money(total)}</span></div>
    </div></div>
    ${get('#oNotes') ? `<div class="notes"><b>OBSERVACIONES</b><div>${esc(get('#oNotes'))}</div></div>` : ''}
    <footer class="footer"><span>WAIPARA DISTRIBUIDORA</span>
        <span>Comprobante de pedido · N.º ${esc(numero)}</span></footer>
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) {
        toast('Habilitá las ventanas emergentes para imprimir el pedido');
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // El diálogo permite elegir «Guardar como PDF».
    win.setTimeout(() => win.print(), 450);
}

$('#printOrder').onclick = printProfessionalOrder;
$('#addLine').onclick = openProductPicker;
$('#newOrder').onclick = newOrder;
$('#newOrder2').onclick = newOrder;
$('#cancelOrder').onclick = () => $('#orderDlg').close();

$('#newClient').onclick = () => editEntity('clientes');
$('#newSeller').onclick = () => editEntity('vendedores');
$('#newProduct').onclick = () => editEntity('productos');


$('#geocodeOrder').onclick = async () => {
    const q = [
        $('#oAddress').value,
        $('#oLocality').value,
        $('#oProvince').value,
        'Argentina'
    ].filter(Boolean).join(', ');

    $('#geoMsg').textContent = 'Buscando…';

    try {
        const j = await fetch(
            'https://nominatim.openstreetmap.org/search' +
            '?format=jsonv2&limit=1&countrycodes=ar&q=' +
            encodeURIComponent(q)
        ).then(r => r.json());

        if (!j.length) {
            throw Error('No se encontró la dirección');
        }

        $('#oLat').value = j[0].lat;
        $('#oLng').value = j[0].lon;

        $('#geoMsg').textContent =
            'Coordenadas encontradas; verificá el punto en el mapa';
    } catch (e) {
        $('#geoMsg').textContent = e.message;
    }
};


/* ============================================================
   [14] GUARDADO Y ELIMINACIÓN DE PEDIDOS
   ============================================================ */

$('#orderForm').onsubmit = async e => {
    e.preventDefault();

    const c = cache.clientes.find(
        x => x.id === $('#oClient').value
    );

    if (!c) {
        toast('Elegí un cliente válido');
        return;
    }

    const chosenDate = $('#oDelivery').value || null;

    const data = {
        numero: editOrderId
            ? $('#oNumber').value.trim()
            : nextOrderNumber(),

        cliente_id: c.id,
        vendedor_id: $('#oSeller').value || null,

        fecha_pedido: $('#oDate').value || iso(new Date()),
        fecha_entrega: chosenDate,

        estado: todayStatus(chosenDate, $('#oStatus').value),

        transportista: $('#oDriver').value || null,
        tipo_pago: $('#oPayment').value || 'Contado',

        direccion_entrega: $('#oAddress').value.trim() || null,
        localidad_entrega: $('#oLocality').value.trim() || null,
        provincia_entrega: $('#oProvince').value.trim() || null,

        latitud: numOrNull($('#oLat').value),
        longitud: numOrNull($('#oLng').value),

        observaciones: $('#oNotes').value.trim() || null
    };

    const lines = [
        ...document.querySelectorAll('.product-line')
    ].map(r => ({
        producto_id: r.querySelector('.line-product').value,
        cantidad: +r.querySelector('.line-qty').value,
        precio_unitario: parsePrice(r.querySelector('.line-price').value),

        descuento_pct: Math.min(
            100,
            Math.max(
                0,
                +r.querySelector('.line-discount').value || 0
            )
        )
    }));

    if (
        !lines.length ||
        lines.some(x =>
            !x.producto_id ||
            x.cantidad <= 0 ||
            x.precio_unitario < 0
        )
    ) {
        toast('Completá correctamente los productos y cantidades');
        return;
    }

    let id = editOrderId;

    if (id) {
        const { error } = await sb
            .from('pedidos')
            .update(data)
            .eq('id', id);

        if (error) {
            toast(error.message);
            return;
        }

        const del = await sb
            .from('pedido_productos')
            .delete()
            .eq('pedido_id', id);

        if (del.error) {
            toast(del.error.message);
            return;
        }
    } else {
        const { data: r, error } = await sb
            .from('pedidos')
            .insert(data)
            .select('id')
            .single();

        if (error) {
            toast(error.message);
            return;
        }

        id = r.id;
    }

    const { error: lineError } = await sb
        .from('pedido_productos')
        .insert(lines.map(x => ({
            ...x,
            pedido_id: id
        })));

    if (lineError) {
        toast(
            'El pedido se guardó, pero falló el detalle: ' +
            lineError.message
        );
        return;
    }

    $('#orderDlg').close();

    await loadAll();
    render();

    toast('Pedido guardado en la base online');
};


$('#deleteOrder').onclick = async () => {
    if (
        !editOrderId ||
        !confirm('¿Eliminar este pedido y sus productos?')
    ) {
        return;
    }

    const { error } = await sb
        .from('pedidos')
        .delete()
        .eq('id', editOrderId);

    if (error) {
        toast(error.message);
        return;
    }

    $('#orderDlg').close();

    await loadAll();
    render();

    toast('Pedido eliminado');
};


/* ============================================================
   [15] CONFIGURACIÓN DEL MAPA Y ESTADO DE LAS RUTAS
   ============================================================ */

const DEPOT = {
    name: 'Depósito Pilar · Sgto. Juan Bautista Cabral 1155, La Lonja',
    lat: -34.4492,
    lng: -58.9153
};

const ROUTE_COLORS = [
    '#1769d2', '#d64545', '#1f9d60', '#8b5cf6', '#d97706',
    '#0891b2', '#db2777', '#475569', '#0f766e', '#be123c'
];

let routeLayers = [];
let routeMarkers = new Map();
let routeVisibility = new Map();
let routeSummaries = new Map();
let optimizedRoutes = null;


function initMap() {
    if (map) return;

    map = L.map('map').setView(
        [DEPOT.lat, DEPOT.lng],
        11
    );

    L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }
    ).addTo(map);
}


/** Pedidos pendientes con coordenadas válidas. */
function mapped() {
    return cache.pedidos.filter(p =>
        !['ENTREGADO', 'NO ENTREGADO'].includes(p.estado) &&
        p.latitud != null &&
        p.longitud != null &&
        Number.isFinite(+p.latitud) &&
        Number.isFinite(+p.longitud)
    );
}


function routeKey(p) {
    return p.fecha_entrega || 'SIN FECHA';
}


function mapGroups() {
    const groups = new Map();

    mapped().forEach(p => {
        const k = routeKey(p);

        if (!groups.has(k)) {
            groups.set(k, []);
        }

        groups.get(k).push(p);
    });

    return groups;
}


function clearMapItems() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    routeMarkers.forEach(ms => {
        ms.forEach(m => map.removeLayer(m));
    });

    routeLayers.forEach(l => {
        map.removeLayer(l.layer);
    });

    routeLayers = [];
    routeMarkers.clear();
    routeSummaries.clear();
}


function toggleRoute(key, on) {
    routeVisibility.set(key, on);

    (routeMarkers.get(key) || []).forEach(m => {
        if (on) m.addTo(map);
        else map.removeLayer(m);
    });

    routeLayers
        .filter(x => x.routeKey === key)
        .forEach(x => {
            if (on) x.layer.addTo(map);
            else map.removeLayer(x.layer);
        });

    const box = [
        ...document.querySelectorAll('[data-route-check]')
    ].find(x => x.dataset.routeCheck === key);

    if (box) box.checked = on;
}


function routeCard(key, color, orders, details = '') {
    const checked = routeVisibility.get(key) !== false;

    return `
        <div class="stop">
            <label class="route-check">
                <input
                    type="checkbox"
                    data-route-check="${esc(key)}"
                    ${checked ? 'checked' : ''}
                >
                <span
                    class="route-color"
                    style="background:${color}"
                ></span>

                <b>${
                    key === 'SIN FECHA'
                        ? 'Sin fecha de entrega'
                        : key.startsWith('OPT-')
                            ? esc(key.replace(
                                'OPT-',
                                'Distribución sugerida · '
                            ))
                            : 'Ruta ' + esc(key)
                }</b>
            </label>

            <div class="muted" data-route-meta="${esc(key)}">
                ${orders.length} paradas
                ${details ? ' · ' + details : ''}
            </div>

            ${orders.map((p, i) => `
                <div>
                    ${i + 1}. #${esc(p.numero)}
                    · ${esc(nameOf('clientes', p.cliente_id))}
                    · ${Number(
                        p.__bultos ??
                        orderProducts(p.id).reduce(
                            (s, x) => s + (+x.cantidad || 0),
                            0
                        )
                    ).toLocaleString('es-AR')} bultos
                </div>
            `).join('')}
        </div>
    `;
}


function drawMap() {
    if (!map) return;

    clearMapItems();

    const depotIcon = L.divIcon({
        className: 'depot-marker',
        html: `
            <div style="
                background:#172534;
                color:white;
                border:2px solid white;
                border-radius:50%;
                padding:7px;
                font-weight:800;
                box-shadow:0 1px 5px #555
            ">D</div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    markers.push(
        L.marker([DEPOT.lat, DEPOT.lng], {
            icon: depotIcon
        }).addTo(map).bindPopup(DEPOT.name)
    );

    const groups = optimizedRoutes || mapGroups();

    $('#stops').innerHTML = `
        <div class="stop">
            <b>🚩 Punto de partida: Depósito Pilar</b>
            <div class="muted">${esc(DEPOT.name)}</div>
        </div>
    `;

    const keys = [...groups.keys()].sort((x, y) =>
        x === 'SIN FECHA' ? 1 :
        y === 'SIN FECHA' ? -1 :
        x.localeCompare(y)
    );

    keys.forEach((key, gi) => {
        const color = ROUTE_COLORS[gi % ROUTE_COLORS.length];
        const orders = groups.get(key);
        const visible = routeVisibility.get(key) !== false;
        const ms = [];

        orders.forEach((p, i) => {
            const icon = L.divIcon({
                className: 'order-marker',
                html: `
                    <div style="
                        background:${color};
                        color:white;
                        border:2px solid white;
                        border-radius:50%;
                        width:28px;
                        height:28px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        font-weight:700;
                        box-shadow:0 1px 5px #555
                    ">${i + 1}</div>
                `,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const m = L.marker(
                [+p.latitud, +p.longitud],
                { icon }
            ).bindPopup(`
                <b>
                    #${esc(p.numero)}
                    · ${esc(nameOf('clientes', p.cliente_id))}
                </b>
                <br>
                ${esc(
                    p.direccion_entrega ||
                    cDeliveryAddress(p.cliente_id)
                )}
                <br>
                ${esc(
                    key === 'SIN FECHA'
                        ? 'Sin fecha de entrega'
                        : key
                )}
                · ${esc(p.estado)}
            `);

            if (visible) m.addTo(map);

            ms.push(m);
            markers.push(m);
        });

        routeMarkers.set(key, ms);

        $('#stops').insertAdjacentHTML(
            'beforeend',
            routeCard(
                key,
                color,
                orders,
                routeSummaries.get(key) || ''
            )
        );
    });

    const missing = cache.pedidos.filter(p =>
        !['ENTREGADO', 'NO ENTREGADO'].includes(p.estado) &&
        (p.latitud == null || p.longitud == null)
    );

    if (missing.length) {
        $('#stops').insertAdjacentHTML(
            'beforeend',
            `<p>${missing.length} pedidos pendientes sin coordenadas.
            Editá el pedido o la ficha del cliente.</p>`
        );
    }

    $('#stops')
        .querySelectorAll('[data-route-check]')
        .forEach(cb => {
            cb.onchange = () => toggleRoute(
                cb.dataset.routeCheck,
                cb.checked
            );
        });

    const pts = [
        [DEPOT.lat, DEPOT.lng],
        ...mapped()
            .filter(p => routeKey(p) !== 'SIN FECHA')
            .map(p => [+p.latitud, +p.longitud])
    ];

    if (pts.length > 1) {
        map.fitBounds(L.latLngBounds(pts).pad(0.15));
    }
}


/* ============================================================
   [16] CÁLCULO DE RUTAS VIALES MEDIANTE OSRM
   ============================================================ */

async function requestRoadRoute(key, orders, color) {
    if (!orders.length) return;

    const coords = [
        `${DEPOT.lng},${DEPOT.lat}`,
        ...orders.map(p => `${p.longitud},${p.latitud}`)
    ].join(';');

    const j = await fetch(
        'https://router.project-osrm.org/route/v1/driving/' +
        coords +
        '?overview=full&geometries=geojson'
    ).then(r => r.json());

    if (j.code !== 'Ok' || !j.routes?.[0]) {
        throw Error('Ruta no disponible para ' + key);
    }

    const layer = L.geoJSON(j.routes[0].geometry, {
        style: {
            color,
            weight: 5,
            opacity: 0.88
        }
    });

    const on = routeVisibility.get(key) !== false;

    if (on) layer.addTo(map);

    routeLayers.push({
        routeKey: key,
        layer
    });

    routeSummaries.set(
        key,
        `${(j.routes[0].distance / 1000).toFixed(1)} km · ` +
        `${Math.round(j.routes[0].duration / 60)} min`
    );
}


$('#route').onclick = async () => {
    if (!map) initMap();

    optimizedRoutes = null;

    const groups = mapGroups();

    const keys = [...groups.keys()]
        .filter(k => k !== 'SIN FECHA')
        .sort();

    if (!keys.length) {
        toast(
            'No hay pedidos pendientes con fecha de entrega y coordenadas'
        );
        drawMap();
        return;
    }

    routeVisibility.clear();
    drawMap();

    $('#route').disabled = true;

    try {
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];

            await requestRoadRoute(
                k,
                groups.get(k),
                ROUTE_COLORS[i % ROUTE_COLORS.length]
            );

            const meta = [
                ...document.querySelectorAll('[data-route-meta]')
            ].find(x => x.dataset.routeMeta === k);

            if (meta) {
                meta.textContent =
                    `${groups.get(k).length} paradas · ` +
                    `${routeSummaries.get(k)}`;
            }
        }

        toast(
            'Recorridos por fecha calculados. ' +
            'Los pedidos sin fecha solo muestran puntos, no rutas.'
        );
    } catch (e) {
        toast(e.message);
    } finally {
        $('#route').disabled = false;
    }
};


/* ============================================================
   [17] DISTRIBUCIÓN DE CARGAS Y ORDEN GEOGRÁFICO
   ============================================================ */

/** Distancia en línea recta (Haversine), en km. */
function haversine(a, b) {
    const rad = x => x * Math.PI / 180;
    const R = 6371;

    const dLat = rad(+b.latitud - +a.latitud);
    const dLng = rad(+b.longitud - +a.longitud);

    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(+a.latitud)) *
        Math.cos(rad(+b.latitud)) *
        Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(x));
}


function bultos(p) {
    return orderProducts(p.id).reduce(
        (s, x) => s + (+x.cantidad || 0),
        0
    );
}


function nearestOrder(from, orders) {
    return [...orders].sort(
        (a, b) => haversine(from, a) - haversine(from, b)
    )[0];
}


/**
 * Distribuye pedidos en viajes con capacidad limitada:
 * mayor a menor, primer viaje con lugar, y orden por
 * vecino más cercano. Es una heurística.
 */
function packTrips(orders, capacity = 310) {
    const sorted = [...orders].sort(
        (a, b) => bultos(b) - bultos(a)
    );

    const trips = [];

    for (const p of sorted) {
        const qty = bultos(p);

        if (qty > capacity) {
            trips.push({
                orders: [p],
                over: qty
            });

            continue;
        }

        let trip = trips.find(
            t => !t.over && t.bultos + qty <= capacity
        );

        if (!trip) {
            trip = {
                orders: [],
                bultos: 0
            };

            trips.push(trip);
        }

        trip.orders.push(p);
        trip.bultos += qty;
    }

    return trips.map(t => {
        let left = [...t.orders];

        let cur = {
            latitud: DEPOT.lat,
            longitud: DEPOT.lng
        };

        const ordered = [];

        while (left.length) {
            const n = nearestOrder(cur, left);

            ordered.push(n);
            left = left.filter(x => x.id !== n.id);
            cur = n;
        }

        return {
            ...t,
            orders: ordered
        };
    });
}


$('#optimizeRoutes').onclick = async () => {
    if (!map) initMap();

    const scope = $('#optimizeScope')?.value || 'all';
    const dated = mapGroups();
    if (scope === 'planned') dated.delete('SIN FECHA');
    if (scope === 'unplanned') {
        for (const key of [...dated.keys()]) if (key !== 'SIN FECHA') dated.delete(key);
    }

    if (!dated.size) {
        toast(
            'No hay pedidos con coordenadas para el alcance seleccionado.'
        );

        return;
    }

    const optimized = new Map();

    for (const [date, orders] of dated) {
        const trips = packTrips(orders);

        trips.forEach((trip, i) => {
            optimized.set(
                `OPT-${date} · Viaje ${i + 1}`,
                trip.orders.map(p => ({
                    ...p,
                    __bultos: bultos(p)
                }))
            );
        });
    }

    optimizedRoutes = optimized;

    routeVisibility.clear();
    routeSummaries.clear();

    drawMap();

    $('#stops').insertAdjacentHTML(
        'beforeend',
        `<p class="help">
            Distribución sugerida mediante agrupación por capacidad
            (máximo 310 bultos) y vecino más cercano por distancia
            geográfica. Es una heurística, no garantiza el óptimo
            matemático.
        </p>`
    );

    const keys = [...optimized.keys()];

    $('#optimizeRoutes').disabled = true;

    try {
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const orders = optimized.get(k);

            if (orders.some(p => bultos(p) > 310)) {
                toast(
                    'Hay un pedido que supera por sí solo los 310 bultos; ' +
                    'requiere dividir la carga.'
                );

                continue;
            }

            await requestRoadRoute(
                k,
                orders,
                ROUTE_COLORS[i % ROUTE_COLORS.length]
            );

            const meta = [
                ...document.querySelectorAll('[data-route-meta]')
            ].find(x => x.dataset.routeMeta === k);

            if (meta) {
                meta.textContent =
                    `${orders.length} paradas · ` +
                    `${routeSummaries.get(k)} · ` +
                    `${orders.reduce((s, p) => s + bultos(p), 0)} bultos`;
            }
        }

        toast(
            'Distribución sugerida lista. Revisá la capacidad y ' +
            'las rutas antes de asignar el camión.'
        );
    } catch (e) {
        toast(e.message);
    } finally {
        $('#optimizeRoutes').disabled = false;
    }
};


/* ============================================================
   [18] NAVEGACIÓN ENTRE VISTAS Y EVENTOS
   ============================================================ */

function switchView(id) {
    document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('active', v.id === id);
    });

    document.querySelectorAll('[data-view]').forEach(b => {
        b.classList.toggle('active', b.dataset.view === id);
    });

    if (id === 'mapView') {
        initMap();

        setTimeout(() => {
            map.invalidateSize();
            drawMap();
        }, 120);
    }
}


document.querySelectorAll('[data-view]').forEach(b => {
    b.onclick = () => switchView(b.dataset.view);
});


$('#prev').onclick = () => {
    week.setDate(week.getDate() - 7);
    render();
};

$('#next').onclick = () => {
    week.setDate(week.getDate() + 7);
    render();
};

$('#today').onclick = () => {
    week = monday(new Date());
    render();
};


[
    '#filterSeller',
    '#filterDriver',
    '#filterStatus'
].forEach(s => {
    $(s).onchange = render;
});


/* ============================================================
   [19] INICIO DE LA APLICACIÓN
   ============================================================ */

start();