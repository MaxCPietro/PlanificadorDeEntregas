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
    'ENTREGADO'
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


/** Fecha visible dd-mmmm-aa; los valores persistidos permanecen en ISO. */
function formatDate(value) {
    if (!value) return '—';
    let year, month, day;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '—';
        year = value.getFullYear();
        month = value.getMonth() + 1;
        day = value.getDate();
    } else {
        const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(String(value));
        if (!match) return String(value);
        [, year, month, day] = match;
        year = Number(year);
        month = Number(month);
        day = Number(day);
        const valid = new Date(year, month - 1, day);
        if (valid.getFullYear() !== year || valid.getMonth() !== month - 1 || valid.getDate() !== day) return String(value);
    }
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return String(day).padStart(2, '0') + '-' + months[month - 1] + '-' +
        String(year).slice(-2).padStart(2, '0');
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
        $('#connection').textContent = 'Conectado · ' + (user.user_metadata?.display_name?.trim() || user.user_metadata?.full_name?.trim() || user.raw_user_meta_data.display_name);

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

        if (t === 'clientes') {
            // Traer todas las páginas: Supabase puede limitar filas por consulta.
            const allClients = [];
            const pageSize = 1000;
            let offset = 0;
            while (true) {
                const { data, error } = await q.range(offset, offset + pageSize - 1);
                if (error) throw error;
                allClients.push(...(data || []));
                if (!data || data.length < pageSize) break;
                offset += pageSize;
            }
            cache[t] = allClients;
        } else {
            const { data, error } = await q.limit(3000);
            if (error) throw error;
            cache[t] = data || [];
        }
    }

    await syncDeliveryStatuses();
    await loadDbGeoRoutes();
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
                !['ENTREGADO'].includes(p.estado)
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
        `<div class="stat"><span>${x}</span><strong>${String(n).padStart(4, "0")}</strong></div>`
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


const uiCalendarOrder = new Map();
const uiTableSort = new Map();

function orderedCards(items, date) {
    const order = uiCalendarOrder.get(date ?? 'backlog') || [];
    return [...items].sort((a, b) => {
        const ia = order.indexOf(String(a.id));
        const ib = order.indexOf(String(b.id));
        return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    });
}

function rememberCardOrder(zone, date) {
    uiCalendarOrder.set(date ?? 'backlog',
        [...zone.querySelectorAll(':scope > .order')].map(n => n.dataset.orderId));
}

function enableTableSorting(id) {
    const table = document.getElementById(id)?.querySelector('table');
    if (!table) return;
    const headers = [...table.querySelectorAll('thead th')];

    function sortableValue(value) {
        const s = value.trim();
        if (!s || s === '—') return { type: 'empty', value: '' };
        // Fechas de la interfaz: dd/mm/aaaa o dd/mm/aa.
        const localDate = /^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2}|\\d{4})(?:\\s|$)/.exec(s);
        if (localDate) {
            const year = Number(localDate[3].length === 2 ? '20' + localDate[3] : localDate[3]);
            const month = Number(localDate[2]);
            const day = Number(localDate[1]);
            const timestamp = Date.UTC(year, month - 1, day);
            const valid = new Date(timestamp);
            if (valid.getUTCFullYear() === year && valid.getUTCMonth() === month - 1 && valid.getUTCDate() === day)
                return { type: 'number', value: timestamp };
        }
        const isoDate = s.split(' ')[0];
        if (isoDate.length === 10 && isoDate[4] === '-' && isoDate[7] === '-') {
            const timestamp = Date.parse(isoDate);
            if (Number.isFinite(timestamp)) return { type: 'number', value: timestamp };
        }
        const dateParts = s.split(' ')[0].split('/');
        if (dateParts.length === 3 && dateParts[2].length === 4) {
            const timestamp = Date.parse(dateParts[2] + '-' + dateParts[1].padStart(2, '0') + '-' + dateParts[0].padStart(2, '0'));
            if (Number.isFinite(timestamp)) return { type: 'number', value: timestamp };
        }
        const cleaned = s.replaceAll('$', '').replaceAll('€', '').replaceAll(' ', '');
        const numericText = cleaned.replaceAll('.', '').replace(',', '.');
        if (numericText && Number.isFinite(Number(numericText))) {
            return { type: 'number', value: Number(numericText) };
        }
        return { type: 'text', value: s };
    }

    function apply() {
        const state = uiTableSort.get(id);
        if (!state) return;
        const body = table.tBodies[0];
        [...body.rows].sort((a, b) => {
            const x = sortableValue(a.cells[state.column]?.textContent || '');
            const y = sortableValue(b.cells[state.column]?.textContent || '');
            if (x.type === 'empty' && y.type !== 'empty') return 1;
            if (y.type === 'empty' && x.type !== 'empty') return -1;
            const result = x.type === 'number' && y.type === 'number'
                ? x.value - y.value
                : String(x.value).localeCompare(String(y.value), 'es', { numeric: true, sensitivity: 'base' });
            return result * state.direction;
        }).forEach(row => body.append(row));
        headers.forEach((th, i) => {
            const btn = th.querySelector('.ui-sort-btn');
            if (btn) btn.textContent = btn.dataset.label + (i === state.column ? (state.direction === 1 ? ' ▲' : ' ▼') : ' ↕');
            th.setAttribute('aria-sort', i === state.column ? (state.direction === 1 ? 'ascending' : 'descending') : 'none');
        });
    }

    // La tabla Pedidos inicia por fecha de entrega descendente.
    if (id === 'ordersTable' && !uiTableSort.has(id)) {
        uiTableSort.set(id, { column: 4, direction: -1 });
    }

    headers.slice(0, -1).forEach((th, i) => {
        const label = th.textContent.trim();
        th.textContent = '';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-sort-btn';
        btn.dataset.label = label;
        btn.textContent = label + ' ↕';
        btn.onclick = () => {
            const old = uiTableSort.get(id);
            uiTableSort.set(id, { column: i, direction: old?.column === i ? -old.direction : 1 });
            apply();
        };
        th.append(btn);
    });
    apply();
}

function calendarShortDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return match ? `${match[3]}/${match[2]}/${match[1].slice(-2)}` : '—';
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
        ${statusBadge(p.estado)}
        <div>${esc(c.nombre || 'Cliente')}</div>
        <small>
            ${esc(p.localidad_entrega || c.localidad || 'Sin localidad')}
            · ${bultos(p)} ${bultos(p) === 1 ? 'bulto' : 'bultos'}${p.estado === 'PENDIENTE' ? ' · Pedido: ' + calendarShortDate(p.fecha_pedido) : ''}
        </small>
        <small>
            Vendedor: ${esc(nameOf('vendedores', p.vendedor_id))}
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


// Feriados nacionales argentinos. Se consultan por año y se almacenan en memoria.
const holidaysByYear = new Map();
const holidaysLoading = new Set();

async function loadHolidays(year) {
    if (holidaysByYear.has(year) || holidaysLoading.has(year)) return;
    holidaysLoading.add(year);
    try {
        const response = await fetch('https://api.argentinadatos.com/v1/feriados/' + year);
        if (!response.ok) throw new Error('No se pudo consultar el calendario de feriados');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Respuesta de feriados inválida');
        const holidays = new Map();
        for (const holiday of data) {
            if (typeof holiday.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(holiday.fecha)) {
                holidays.set(holiday.fecha, holiday.nombre || 'Feriado nacional');
            }
        }
        holidaysByYear.set(year, holidays);
        renderCalendar();
    } catch (error) {
        console.warn('No se pudieron cargar los feriados nacionales:', error);
    } finally {
        holidaysLoading.delete(year);
    }
}

function calendarDate(d) {
    return String(d.getDate()).padStart(2, '0') + '/' +
        String(d.getMonth() + 1).padStart(2, '0');
}

function renderCalendar() {
    const a = filtered();
    const back = $('#backlog');

    back.innerHTML = '';

    const un = a.filter(p =>
        !p.fecha_entrega &&
        !['ENTREGADO'].includes(p.estado)
    );

    $('#backlogCount').textContent = `(${un.length})`;

    orderedCards(un,null).forEach(p => back.append(orderCard(p)));
    dropZone(back, null);
    const sortBacklog = $('#sortBacklog');
    if (sortBacklog) sortBacklog.onclick = () => {
        const cards = [...back.querySelectorAll(':scope > .order')];
        cards.sort((a, b) => {
            const pa = cache.pedidos.find(p => String(p.id) === a.dataset.orderId);
            const pb = cache.pedidos.find(p => String(p.id) === b.dataset.orderId);
            return (Number(pa?.numero) || 0) - (Number(pb?.numero) || 0);
        }).forEach(card => back.append(card));
        rememberCardOrder(back, null);
    };

    const cal = $('#calendar');
    cal.innerHTML = '';

    const days = [
        'Lunes', 'Martes', 'Miércoles', 'Jueves',
        'Viernes', 'Sábado', 'Domingo'
    ];

    const end = new Date(week);
    end.setDate(end.getDate() + 6);
    for (const year of new Set([week.getFullYear(), end.getFullYear()])) {
        void loadHolidays(year);
    }

    $('#week').textContent =
        String(week.getDate()).padStart(2, '0') + '/' +
        String(week.getMonth() + 1).padStart(2, '0') + '/' +
        week.getFullYear() +
        ' — ' +
        String(end.getDate()).padStart(2, '0') + '/' +
        String(end.getMonth() + 1).padStart(2, '0') + '/' +
        end.getFullYear();

    for (let i = 0; i < 7; i++) {
        const d = new Date(week);
        d.setDate(d.getDate() + i);

        const col = document.createElement('div');
        const holiday = holidaysByYear.get(d.getFullYear())?.get(iso(d));
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        col.className = 'day' + (weekend ? ' day-weekend' : '') +
            (holiday ? ' day-holiday' : '');
        if (holiday) col.title = holiday;

        col.innerHTML = `
            <div class="day-head">
                <span>${days[i]}</span>
                <span>${calendarDate(d)}</span>
            </div>
            <div class="drop"></div>
        `;

        const z = col.querySelector('.drop');

        orderedCards(a.filter(p => p.fecha_entrega === iso(d)),iso(d))
            .forEach(p => z.append(orderCard(p)));
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
                    <th>Fecha de Pedido</th>
                    <th>Fecha entrega</th>
                    <th>Estado</th>
                    <th>Transportista</th>
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
                        <td>${esc(formatDate(p.fecha_pedido))}</td>
                        <td>${esc(formatDate(p.fecha_entrega))}</td>
                        <td>${statusBadge(p.estado)}</td>
                        <td>${esc(p.transportista || '—')}</td>
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

    const fieldSelect = $('#clientSearchField');
    if (fieldSelect && !fieldSelect.dataset.initialized) {
        fieldSelect.innerHTML = '<option value="*">Todas las columnas</option>' +
            cols.map(([key, label]) =>
                `<option value="${key}">${esc(label)}</option>`
            ).join('');
        fieldSelect.addEventListener('change', renderClients);
        fieldSelect.dataset.initialized = 'true';
    }

    const search = ($('#clientSearch')?.value || '').trim().toLocaleLowerCase('es-AR');
    const selectedField = fieldSelect?.value || '*';
    const searchableColumns = selectedField === '*'
        ? cols.map(([key]) => key)
        : [selectedField];
    const filteredClients = cache.clientes.filter(c =>
        !search || searchableColumns.some(key => {
            const value = key === 'activo' ? (c[key] ? 'Sí' : 'No') : c[key];
            return value != null &&
                String(value).toLocaleLowerCase('es-AR').includes(search);
        })
    );
    const count = $('#clientSearchCount');
    if (count) {
        count.textContent = `Mostrando ${filteredClients.length} de ${cache.clientes.length} clientes`;
    }

    $('#clientsTable').innerHTML = `
        <table class="client-table">
            <thead>
                <tr>
                    ${cols.map(c => `<th>${c[1]}</th>`).join('')}
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${filteredClients.map(c => `
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

    const searchInput = $('#clientSearch');
    if (searchInput && !searchInput.dataset.filterBound) {
        searchInput.addEventListener('input', () => renderClients());
        searchInput.dataset.filterBound = 'true';
    }

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
            min="1"
            step="1"
            value="${Math.max(1, Math.trunc(Number(p.cantidad) || 1))}"
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

    const qtyInput = row.querySelector('.line-qty');
    qtyInput.addEventListener('change', () => {
        qtyInput.value = String(Math.max(1, Math.trunc(Number(qtyInput.value) || 1)));
        calcTotal();
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
    if (!date) return 'PENDIENTE';
    const today = iso(new Date());
    if (date < today) return 'ENTREGADO';
    if (date === today) return 'EN REPARTO';
    return 'PROGRAMADO';
}

function statusBadge(status) {
    const safe = STATUS.includes(status) ? status : 'PENDIENTE';
    return `<span class="status-badge status-${safe.replaceAll(' ', '-')}">${esc(safe)}</span>`;
}

async function syncDeliveryStatuses() {
    const changes = cache.pedidos.filter(p => p.estado !== todayStatus(p.fecha_entrega, p.estado));
    for (const p of changes) {
        const next = todayStatus(p.fecha_entrega, p.estado);
        const { error } = await sb.from('pedidos').update({ estado: next }).eq('id', p.id);
        if (error) throw error;
        p.estado = next;
    }
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
    calcTotal();
    $('#geoMsg').textContent = '';

    $('#deleteOrder').classList.add('hidden');

    populateSelects();
    updatePrintDetails();

    $('#orderDlg').showModal();
}


async function editOrder(id) {
    setGeoOrderReadOnly(false);
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
        ' · ' + formatDate(p.fecha_pedido) +
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
        `Fecha: ${formatDate($('#oDate').value)}`;

    $('#printOrderDetails').innerHTML = `
        <span><b>Cliente:</b> ${esc(c.nombre || '—')}</span>
        <span><b>CUIT/Código:</b> ${esc(c.codigo || '—')}</span>
        <span><b>Dirección:</b> ${esc($('#oAddress').value || '—')}</span>
        <span><b>Localidad:</b> ${esc($('#oLocality').value || '—')},
            ${esc($('#oProvince').value || '')}</span>
        <span><b>Entrega:</b>
            ${esc($('#oDelivery').value ? formatDate($('#oDelivery').value) : 'Sin programar')}</span>
        <span><b>Pago:</b> ${esc($('#oPayment').value || 'Contado')}</span>
        <span><b>Vendedor:</b>
            ${esc(nameOf('vendedores', $('#oSeller').value))}</span>
        <span><b>Transportista:</b>
            ${esc($('#oDriver').value || 'Sin asignar')}</span>
    `;
}


$('#oDelivery').onchange = () => {
    $('#oStatus').value = todayStatus($('#oDelivery').value, $('#oStatus').value);
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
    const numeroFormateado = /^\d+$/.test(numero)
        ? numero.padStart(4, '0')
        : safePart(numero);
    const fileName = `P${numeroFormateado}-${safePart(cliente)}`;
    const dateAR = value => value ? formatDate(value) : 'Sin programar';
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
    // Chrome no garantiza el nombre del archivo mediante window.print().
    // Se ofrece descarga directa con nombre exacto, conservando impresión manual.
    const win = window.open('', '_blank');
    if (!win) {
        toast('Habilitá las ventanas emergentes para generar el PDF');
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.title = fileName;

    const toolbar = win.document.createElement('div');
    toolbar.id = 'pdfActions';
    toolbar.style.cssText = 'position:fixed;top:8px;right:12px;z-index:9999;display:flex;gap:8px;background:white;padding:8px;border:1px solid #ddd;border-radius:8px;box-shadow:0 2px 12px #0002';
    toolbar.innerHTML = '<button id="downloadOrderPdf" type="button">Descargar PDF</button><button id="printOrderPdf" type="button">Imprimir</button>';
    win.document.body.prepend(toolbar);
    const style = win.document.createElement('style');
    style.textContent = '@media print { #pdfActions { display:none !important } }';
    win.document.head.appendChild(style);
    win.document.getElementById('printOrderPdf').onclick = () => win.print();
    const downloadButton = win.document.getElementById('downloadOrderPdf');
    downloadButton.onclick = async () => {
        downloadButton.disabled = true;
        downloadButton.textContent = 'Generando PDF...';
        try {
            if (!win.html2pdf) {
                await new Promise((resolve, reject) => {
                    const script = win.document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('No se pudo cargar el generador PDF'));
                    win.document.head.appendChild(script);
                });
            }
            toolbar.style.display = 'none';
            await win.html2pdf().set({
                margin: 0, // El HTML ya incorpora márgenes visuales; html2pdf requiere un valor válido.
                filename: fileName + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'] }
            }).from(win.document.body).save();
        } catch (error) {
            console.error('Error generando PDF:', error);
            win.alert('No se pudo generar el PDF: ' + (error?.message || String(error)) + '\nPodés usar Imprimir como alternativa.');
        } finally {
            toolbar.style.display = 'flex';
            downloadButton.disabled = false;
            downloadButton.textContent = 'Descargar PDF';
        }
    };
    win.focus();
    // Generar y descargar el PDF automáticamente, sin abrir el diálogo de impresión.
    // Se conserva el botón Imprimir para quien necesite una copia en papel.
    // La descarga debe iniciarse con un clic real del usuario para evitar bloqueos del navegador.
    // No disparar click() automáticamente desde una ventana nueva.
}


$('#printOrder').onclick = printProfessionalOrder;
$('#addLine').onclick = openProductPicker;
$('#newOrder').onclick = newOrder;
$('#newOrder2').onclick = newOrder;
$('#cancelOrder').onclick = () => $('#orderDlg').close();

$('#newClient').onclick = () => editEntity('clientes');
$('#newSeller').onclick = () => editEntity('vendedores');
$('#newProduct').onclick = () => editEntity('productos');


$('#verifyOrderMap').onclick = () => {
    const latText = $('#oLat').value.trim();
    const lngText = $('#oLng').value.trim();
    const lat = Number(latText), lng = Number(lngText);
    if (!latText || !lngText || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        toast('Primero ingresá o buscá coordenadas válidas');
        return;
    }
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lng), '_blank', 'noopener,noreferrer');
};

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

    // Sincronizar los datos de entrega del pedido con la ficha del cliente.
    // Solo actualizamos los campos que cambiaron para evitar escrituras innecesarias.
    const clientUpdates = {};
    for (const field of ['direccion_entrega', 'latitud', 'longitud']) {
        const previous = field === 'direccion_entrega'
            ? (c[field] || null)
            : (c[field] == null ? null : Number(c[field]));
        if (previous !== data[field]) {
            clientUpdates[field] = data[field];
        }
    }

    if (Object.keys(clientUpdates).length) {
        const { error: clientError } = await sb
            .from('clientes')
            .update(clientUpdates)
            .eq('id', c.id);

        if (clientError) {
            toast('Pedido guardado, pero no se pudo actualizar el cliente: ' + clientError.message);
            return;
        }
    }

    $('#orderDlg').close();

    await loadAll();
    render();

    toast('Pedido y datos del cliente guardados en la base online');
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

const geoSettings = JSON.parse(localStorage.getItem('waiparaGeoSettings') || '{}');
const DEPOT = {
    name: geoSettings.depotName || 'Depósito Pilar · Sgto. Juan Bautista Cabral 1155, La Lonja',
    lat: Number.isFinite(+geoSettings.lat) && geoSettings.lat !== undefined ? +geoSettings.lat : -34.441901,
    lng: Number.isFinite(+geoSettings.lng) && geoSettings.lng !== undefined ? +geoSettings.lng : -58.862627
};
function geoFuelSummary(km) {
    const liters = km * (Number(geoSettings.consumption) || 12) / 100;
    const price = Number(geoSettings.fuelPrice);
    return liters.toFixed(1) + ' L estimados' +
        (price > 0 ? ' · $ ' + (liters * price).toLocaleString('es-AR', {maximumFractionDigits: 0}) : ' · precio/L sin configurar');
}
function geoSetup() {
 const panel=document.getElementById('geoSettingsPanel');
 if(!panel || panel.dataset.ready) return;
 panel.dataset.ready='1';
 panel.innerHTML='<label>L/100 km <input id="geoConsumption" type="number" min="0.1" step="0.1" style="width:65px"></label> <label>Combustible $/L <input id="geoFuelPrice" type="number" min="0" step="0.01" style="width:85px" placeholder="Precio"></label>';
 panel.querySelector('#geoConsumption').value=geoSettings.consumption||12;
 panel.querySelector('#geoFuelPrice').value=geoSettings.fuelPrice||'';
 panel.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
  const consumption=Number(panel.querySelector('#geoConsumption').value);
  const fuelPrice=panel.querySelector('#geoFuelPrice').value;
  if(!(consumption>0) || (fuelPrice!=='' && Number(fuelPrice)<0)){toast('Revisá los valores');return;}
  Object.assign(geoSettings,{consumption,fuelPrice});
  localStorage.setItem('waiparaGeoSettings',JSON.stringify(geoSettings));
  toast('Configuración guardada localmente');
 }));
}


const ROUTE_COLORS = [
    '#1769d2', '#d64545', '#1f9d60', '#8b5cf6', '#d97706',
    '#0891b2', '#db2777', '#475569', '#0f766e', '#be123c'
];

let routeLayers = [];
let routeMarkers = new Map();
let routeVisibility = new Map();
let routeSummaries = new Map();
let optimizedRoutes = null;
// Las rutas reales se almacenan exclusivamente en Supabase.
const excludedGeoOrders=new Set();
let dbGeoRoutes=[];
async function loadDbGeoRoutes(){
 if(!sb)return;
 const [routes,links]=await Promise.all([
  sb.from('rutas').select('*').order('fecha',{ascending:false}).limit(3000),
  sb.from('ruta_pedidos').select('*').limit(10000)
 ]);
 if(routes.error)throw routes.error;
 if(links.error)throw links.error;
 const byId=new Map();
 for(const link of links.data||[]){
  if(!byId.has(link.ruta_id))byId.set(link.ruta_id,[]);
  byId.get(link.ruta_id).push(link);
 }
 dbGeoRoutes=(routes.data||[]).map(r=>{
  const km=r.distancia_km==null?null:Number(r.distancia_km)+Number(r.retorno_km||0);
  const min=r.duracion_min==null?null:Number(r.duracion_min)+Number(r.retorno_min||0);
  const liters=km==null?null:km*Number(r.consumo_l_100km||12)/100;
  const cost=liters==null||r.precio_litro==null?null:liters*Number(r.precio_litro);
  const resumen=km==null?'':km.toFixed(1)+' km ida y vuelta · '+Math.round(min||0)+' min · '+liters.toFixed(1)+' L estimados'+(cost==null?' · precio/L sin configurar':' · $ '+cost.toLocaleString('es-AR',{maximumFractionDigits:0}));
  return {...r,key:r.fecha+' · '+r.transportista,
   pedidos:(byId.get(r.id)||[]).sort((x,y)=>x.orden-y.orden),resumen};
 });
 renderStoredRoutes();
}
async function saveRealRoute(key,orders,route){
 if(key.startsWith('OPT-'))return; // Optimización: simulación sin persistencia.
 const date=orders[0]?.fecha_entrega;
 const driver=orders[0]?.transportista||'Sin asignar';
 if(!date)throw Error('No se guardan rutas sin fecha');
 const all=cache.pedidos.filter(p=>p.fecha_entrega===date&&(p.transportista||'Sin asignar')===driver);
 if(all.some(p=>p.estado==='ENTREGADO'))throw Error('Ruta histórica con pedidos entregados: no se modifica');
 const {error}=await sb.rpc('waipara_guardar_ruta_real',{
  p_fecha:date,p_transportista:driver,p_viaje:1,
  p_pedidos:all.map((p,i)=>({pedido_id:p.id,orden:i+1,incluido:!excludedGeoOrders.has(String(p.id))})),
  p_distancia_km:route.distance/1000,p_duracion_min:route.duration/60,
  p_retorno_km:0,p_retorno_min:0,
  p_consumo_l_100km:Number(geoSettings.consumption)||12,
  p_precio_litro:Number(geoSettings.fuelPrice)>0?Number(geoSettings.fuelPrice):null,
  p_instrucciones:[],p_geometria:route.geometry
 });
 if(error)throw Error('Supabase: '+error.message);
 await loadDbGeoRoutes();
}
function geoRouteIdentity(route) {
 const date=route.fecha||route.key?.replace(/^OPT-/,'').split(' · ')[0]||'SIN FECHA';
 const driver=String(route.transportista||'Sin asignar').trim().toLocaleLowerCase('es');
 const orderIds=[...(route.pedidos||[])].map(p=>String(p.pedido_id)).sort();
 return date+'|'+driver+'|'+orderIds.join(',');
}
function dedupeGeoRoutes(routes) {
 const dateOf=r=>r.fecha||r.key?.replace(/^OPT-/,'').split(' · ')[0]||'SIN FECHA';
 const driverOf=r=>String(r.transportista||'Sin asignar').trim().toLocaleLowerCase('es');
 const isOptimized=r=>r.key?.startsWith('OPT-');
 const byIdentity=new Map();
 for(const route of routes){
  const id=geoRouteIdentity(route);
  const prior=byIdentity.get(id);
  const score=r=>(isOptimized(r)?4:0)+(r.resumen?2:0);
  if(!prior||score(route)>score(prior))byIdentity.set(id,route);
 }
 const unique=[...byIdentity.values()];
 const optimizedByGroup=new Map();
 for(const r of unique.filter(isOptimized)){
  const group=dateOf(r)+'|'+driverOf(r);
  if(!optimizedByGroup.has(group))optimizedByGroup.set(group,new Set());
  (r.pedidos||[]).forEach(p=>optimizedByGroup.get(group).add(String(p.pedido_id)));
 }
 const result=[];
 for(const route of unique){
  if(isOptimized(route)){result.push(route);continue;}
  const group=dateOf(route)+'|'+driverOf(route);
  const assigned=optimizedByGroup.get(group);
  if(!assigned){result.push(route);continue;}
  const remaining=(route.pedidos||[]).filter(p=>!assigned.has(String(p.pedido_id)));
  if(remaining.length)result.push({...route,pedidos:remaining,resumen:null});
 }
 return result;
}

function persistGeoRoutes(){
 // Compatibilidad con los eventos de mapa: no se escribe en LocalStorage ni Supabase.
 renderStoredRoutes();
}

function geoDisplayDate(value) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return 'Sin fecha';
 const [year,month,day]=value.split('-').map(Number);
 const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
 return String(day).padStart(2,'0')+'-'+months[month-1]+'-'+String(year).slice(-2);
}
function setGeoOrderReadOnly(enabled) {
 const dlg=document.getElementById('orderDlg');
 if(!dlg)return;
 dlg.classList.toggle('geo-order-readonly',enabled);
 const form=document.getElementById('orderForm');
 form.querySelectorAll('input,select,textarea').forEach(el=>{
  if(enabled){el.dataset.geoPriorDisabled=el.disabled?'1':'0';el.disabled=true;}
  else if(el.dataset.geoPriorDisabled!==undefined){
   el.disabled=el.dataset.geoPriorDisabled==='1';
   delete el.dataset.geoPriorDisabled;
  }
 });
}
document.getElementById('orderDlg')?.addEventListener('close',()=>setGeoOrderReadOnly(false));
async function openStoredGeoOrder(id) {
 try {
  const {data,error}=await sb.from('pedidos').select('*').eq('id',id).single();
  if(error)throw error;
  if(!data)throw Error('Pedido no encontrado en Supabase');
  const index=cache.pedidos.findIndex(p=>String(p.id)===String(id));
  if(index<0)cache.pedidos.push(data);else cache.pedidos[index]=data;
  // Actualizar el detalle de productos antes de abrir el modal existente.
  const {data:items,error:itemsError}=await sb.from('pedido_productos').select('*').eq('pedido_id',id);
  if(itemsError)throw itemsError;
  cache.pedido_productos=cache.pedido_productos.filter(p=>String(p.pedido_id)!==String(id)).concat(items||[]);
  editOrder(data.id);
  document.getElementById('orderTitle').textContent='Consultar pedido #'+data.numero;
  setGeoOrderReadOnly(true);
 }catch(e){toast('No se pudo recuperar el pedido: '+e.message);}
}
function renderStoredRoutes(){
 const host=document.getElementById('geoStoredRoutes');
 if(!host)return;
 const routes=dbGeoRoutes.filter(r=>!r.key?.startsWith('OPT-')).map(r=>({
  ...r,pedidos:(r.pedidos||[]).filter(link=>{
   const p=cache.pedidos.find(p=>String(p.id)===String(link.pedido_id));
   return !!p;
  })
 })).filter(r=>r.pedidos.length);
 const today=iso(new Date());
 const statusFor=date=>{
  if(!date||date==='SIN FECHA'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return ['PENDIENTE','Sin planificar'];
  if(date<today)return ['ENTREGADO','Entregado'];
  if(date===today)return ['EN REPARTO','En reparto'];
  return ['PROGRAMADO','Planificado'];
 };
 const sort=window.geoRouteSort||{column:'fecha',asc:false};
 const selectedStatuses=window.geoRouteStatusFilters||new Set(['PENDIENTE','PROGRAMADO','EN REPARTO']);
 const countByDate=new Map();
 routes.forEach(r=>countByDate.set(r.fecha,(countByDate.get(r.fecha)||0)+1));
 const sequenceByDate=new Map();
 const formatNumber=n=>n==null?'':n.toLocaleString('es-AR',{maximumFractionDigits:1});
 const records=routes.map((r,index)=>{
  const orders=(r.pedidos||[]).map(link=>{
   const p=cache.pedidos.find(p=>String(p.id)===String(link.pedido_id));
   return p?{...p,__included:link.incluido!==false,__order:link.orden}:null;
  }).filter(Boolean).sort((x,y)=>(x.__order||0)-(y.__order||0));
  const stops=groupedStops(orders.filter(p=>p.__included));
  const [status,label]=statusFor(r.fecha);
  const n=(sequenceByDate.get(r.fecha)||0)+1;
  sequenceByDate.set(r.fecha,n);
  const base=routeDisplayName(r.key);
  const routeName=countByDate.get(r.fecha)>1?base+'-'+n:base;
  const summary=r.resumen||'';
  const kmMatch=summary.match(/(\d+(?:[.,]\d+)?)\s*km\b/i);
  const litersMatch=summary.match(/(\d+(?:[.,]\d+)?)\s*L\s*estimados/i);
  const costMatch=summary.match(/\$\s*([\d.,]+)/);
  const parseDecimal=v=>v==null?null:Number(v.replace(',','.'));
  const km=kmMatch?parseDecimal(kmMatch[1]):null;
  const liters=litersMatch?parseDecimal(litersMatch[1]):null;
  const cost=costMatch?Number(costMatch[1].replace(/\./g,'').replace(',','.')):null;
  const totalBultos=orders.filter(p=>p.__included).reduce((sum,p)=>sum+bultos(p),0);
  const numbers=orders.map(p=>{
   const client=nameOf('clientes',p.cliente_id);
   const tooltip='Pedido #'+p.numero+' - '+client;
   return '<button type="button" class="geo-order-tooltip" data-order-id="'+esc(String(p.id))+'" title="'+esc(tooltip).replaceAll('"','&quot;')+'">#'+esc(p.numero)+'</button>'+(p.__included?'':' (excluido)');
  }).join(', ');
  const cells=[
   '<button type="button" class="geo-route-link" data-stored-route="'+index+'" title="Ver detalle de '+esc(routeName)+'">'+esc(routeName)+'</button>',
   esc(geoDisplayDate(r.fecha)),esc(r.transportista||'—'),String(stops.length),
   numbers,String(totalBultos),'<span class="status-badge status-'+status.replaceAll(' ','-')+'">'+esc(label)+'</span>',formatNumber(km),formatNumber(liters),
   cost==null?'':'$ '+cost.toLocaleString('es-AR',{maximumFractionDigits:0}),
   esc(summary)
  ];
  return {ruta:routeName,fecha:r.fecha||'',transportista:r.transportista||'',paradas:stops.length,pedidos:orders.length,bultos:totalBultos,estado:label,km,litros:liters,costo:cost,resumen:summary,status,html:'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>',route:r,orders};
 });
 const filteredRecords=records.filter(r=>selectedStatuses.has(r.status));
 filteredRecords.sort((x,y)=>{
  const av=x[sort.column],bv=y[sort.column];
  if(av==null||bv==null)return av==null&&bv==null?0:av==null?1:-1;
  const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'es',{numeric:true});
  return sort.asc?cmp:-cmp;
 });
 const columns=[['ruta','Ruta'],['fecha','Fecha'],['transportista','Transportista'],['paradas','Paradas'],['pedidos','# Pedidos'],['bultos','Σ Bultos'],['estado','Estado'],['km','Σ Km Aprox'],['litros','Σ Litros Aprox'],['costo','$ Aprox'],['resumen','Resumen']];
 const headers=columns.map(([id,label])=>'<th><button type="button" class="geo-sort" data-geo-sort="'+id+'" aria-label="Ordenar por '+label+'">'+label+' '+(sort.column===id?(sort.asc?'▲':'▼'):'↕')+'</button></th>').join('');
 const statusOptions=[['PENDIENTE','Sin planificar'],['PROGRAMADO','Planificado'],['EN REPARTO','En reparto'],['ENTREGADO','Entregado']];
 const filterHtml='<div class="geo-route-filter"><span>Estados:</span>'+statusOptions.map(([id,label])=>'<label class="geo-state-choice"><input type="checkbox" data-geo-status="'+id+'" '+(selectedStatuses.has(id)?'checked':'')+'> '+label+'</label>').join('')+'</div>';
 host.innerHTML='<div class="geo-route-table-heading"><h3>Listado de rutas</h3>'+filterHtml+'</div>'+(filteredRecords.length?'<div class="table-wrap"><table><thead><tr>'+headers+'</tr></thead><tbody>'+filteredRecords.map(r=>r.html).join('')+'</tbody></table></div>':'<p class="muted">No hay rutas para los estados seleccionados.</p>');
 host.querySelectorAll('[data-geo-status]').forEach(input=>input.onchange=()=>{
  const next=new Set(selectedStatuses);
  if(input.checked)next.add(input.dataset.geoStatus);else next.delete(input.dataset.geoStatus);
  window.geoRouteStatusFilters=next;renderStoredRoutes();
 });
 host.querySelectorAll('[data-order-id]').forEach(btn=>btn.onclick=()=>openStoredGeoOrder(btn.dataset.orderId));
 host.querySelectorAll('[data-stored-route]').forEach(btn=>btn.onclick=()=>{
  const record=records[Number(btn.dataset.storedRoute)];
  if(record)openRouteDetails(record.route.key,record.orders.filter(p=>p.__included),record.ruta);
 });
 host.querySelectorAll('[data-geo-sort]').forEach(btn=>btn.onclick=()=>{
  const column=btn.dataset.geoSort;
  window.geoRouteSort={column,asc:sort.column===column?!sort.asc:true};
  renderStoredRoutes();
 });
}

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
        p.estado !== 'ENTREGADO' &&
        p.latitud != null &&
        p.longitud != null &&
        Number.isFinite(+p.latitud) &&
        Number.isFinite(+p.longitud)
    );
}


function routeKey(p) {
    return (p.fecha_entrega || 'SIN FECHA') + ' · ' + (p.transportista || 'Sin transportista');
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


function groupedStops(orders) {
 const stops=[];
 const index=new Map();
 orders.forEach(p=>{
  // Aproximadamente un metro: evita visitas duplicadas por coordenadas idénticas.
  const key=(+p.latitud).toFixed(5)+','+(+p.longitud).toFixed(5);
  if(!index.has(key)){const stop={lat:+p.latitud,lng:+p.longitud,orders:[]};index.set(key,stop);stops.push(stop);}
  index.get(key).orders.push(p);
 });
 return stops;
}
let routeDetailMap = null;
let routeDetailRequest = 0;
async function openRouteDetails(key, storedOrders = null, displayName = null) {
    const groups = optimizedRoutes || mapGroups();
    const orders = (storedOrders || groups.get(key) || []).filter(p=>!excludedGeoOrders.has(String(p.id)));
    const stops = groupedStops(orders);
    if (!orders.length) { toast('No hay pedidos incluidos en esta ruta'); return; }
    let dialog = document.getElementById('geoRouteDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'geoRouteDialog';
        dialog.style.cssText = 'width:min(1000px,95vw);max-height:92vh;padding:18px;border:1px solid #ddd;border-radius:12px';
        dialog.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2 id="geoRouteTitle"></h2><div style="display:flex;gap:6px"><button type="button" id="geoMaxRoute" title="Maximizar o restaurar">⛶</button><button type="button" id="geoCloseRoute">Cerrar</button></div></div>' +
            '<div id="geoRouteSummary"></div><div id="geoDetailMap" style="height:420px;min-height:280px;margin:12px 0;border-radius:8px"></div>' +
            '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin:8px 0"><span>🔵 Ida y entregas</span><span>🟠 Regreso al depósito</span></div>' +
            '<h3>Consumo por parada</h3><div id="geoRouteStops"></div>';
        document.body.appendChild(dialog);
        dialog.querySelector('#geoCloseRoute').onclick = () => dialog.close();
        dialog.querySelector('#geoMaxRoute').onclick = () => { dialog.classList.toggle('geo-route-maximized'); setTimeout(()=>routeDetailMap?.invalidateSize(),80); };
        dialog.addEventListener('close', () => {
            routeDetailRequest++;
            if (routeDetailMap) { routeDetailMap.remove(); routeDetailMap = null; }
        });
    }
    const requestId = ++routeDetailRequest;
    dialog.querySelector('#geoRouteTitle').textContent = (displayName || routeDisplayName(key)) + ' · ' + (orders[0].transportista || 'Sin asignar');
    dialog.querySelector('#geoRouteSummary').textContent = orders.length + ' paradas · Calculando ida y regreso…';
    dialog.querySelector('#geoRouteStops').textContent = 'Calculando consumo por tramo…';
    if (routeDetailMap) { routeDetailMap.remove(); routeDetailMap = null; }
    dialog.showModal();
    routeDetailMap = L.map('geoDetailMap').setView([DEPOT.lat, DEPOT.lng],11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(routeDetailMap);
    setTimeout(() => { if (requestId===routeDetailRequest) routeDetailMap?.invalidateSize(); },100);
    const points = [DEPOT,...stops,DEPOT];
    const coords = points.map(p=>p.lng+','+p.lat).join(';');
    try {
        const response = await fetch('https://router.project-osrm.org/route/v1/driving/'+coords+'?overview=full&geometries=geojson&steps=true');
        if (!response.ok) throw Error('Servicio de rutas no disponible');
        const result = await response.json();
        if (result.code !== 'Ok' || !result.routes?.[0]) throw Error('No se pudo calcular el recorrido');
        if (!dialog.open || !routeDetailMap || requestId!==routeDetailRequest) return;
        const route = result.routes[0];
        const legs = route.legs || [];
        const consumption = Number(geoSettings.consumption) || 12;
        // Cada tramo OSRM aporta su propia geometría; el último tramo es exclusivamente el regreso.
        const outbound = [];
        const inbound = [];
        legs.forEach((leg,i) => {
            const target = i===legs.length-1 ? inbound : outbound;
            (leg.steps || []).forEach(step => {
                const coordinates = step.geometry?.coordinates || [];
                coordinates.forEach(c => {
                    if (!target.length || target[target.length-1][0]!==c[1] || target[target.length-1][1]!==c[0])
                        target.push([c[1],c[0]]);
                });
            });
        });
        if (outbound.length>1) L.polyline(outbound,{color:'#1769d2',weight:5}).addTo(routeDetailMap);
        if (inbound.length>1) L.polyline(inbound,{color:'#e87917',weight:5,dashArray:'9 6'}).addTo(routeDetailMap);
        // Fallback si OSRM no entrega geometría detallada de los tramos.
        if (outbound.length<2 || inbound.length<2) {
            L.geoJSON(route.geometry,{style:{color:'#1769d2',weight:4}}).addTo(routeDetailMap);
        }
        const bounds = L.latLngBounds(points.map(p=>[p.lat,p.lng]));
        routeDetailMap.fitBounds(bounds.pad(0.12));
        let cumulativeKm = 0;
        const rows = legs.map((leg,i) => {
            const km = leg.distance/1000;
            cumulativeKm += km;
            const liters = km*consumption/100;
            const totalLiters = cumulativeKm*consumption/100;
            const isReturn = i===legs.length-1;
            const label = isReturn ? 'Regreso al depósito' : ('Parada '+(i+1)+' · '+stops[i].orders.map(p=>'#'+p.numero+' '+nameOf('clientes',p.cliente_id)).join(' / '));
            return '<div style="padding:8px 0;border-bottom:1px solid #e5e7eb"><b>'+esc(label)+'</b><div class="muted">'+km.toFixed(1)+' km · '+Math.round(leg.duration/60)+' min · '+liters.toFixed(2)+' L tramo · '+totalLiters.toFixed(2)+' L acumulados</div></div>';
        });
        points.forEach((p,i) => {
            const label = i===0 ? 'Salida · Depósito Pilar' : i===points.length-1 ? 'Regreso · Depósito Pilar' : 'Parada '+i+' · '+stops[i-1].orders.map(o=>'#'+o.numero+' '+nameOf('clientes',o.cliente_id)).join(' / ');
            const fuel = i===0 ? 0 : legs.slice(0,i).reduce((sum,leg)=>sum+leg.distance,0)/1000*consumption/100;
            L.marker([p.lat,p.lng]).addTo(routeDetailMap).bindTooltip(esc(label)).bindPopup(esc(label)+'<br>Combustible acumulado: '+fuel.toFixed(2)+' L');
        });
        dialog.querySelector('#geoRouteSummary').textContent = stops.length+' paradas ('+orders.length+' pedidos) · '+(route.distance/1000).toFixed(1)+' km ida y vuelta · '+Math.round(route.duration/60)+' min · '+geoFuelSummary(route.distance/1000);
        dialog.querySelector('#geoRouteStops').innerHTML = rows.join('');
    } catch(e) {
        if(dialog.open && requestId===routeDetailRequest) dialog.querySelector('#geoRouteStops').textContent = e.message;
    }
}

function routeDisplayName(key) {
    const raw = key.startsWith('OPT-') ? key.slice(4) : key;
    const date = raw.split(' · ')[0];
    if (date === 'SIN FECHA') return 'Sin fecha de entrega';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const suffix = key.startsWith('OPT-') ? (raw.match(/Viaje \d+/)?.[0] || '') : '';
    return m ? 'R-' + m[3] + m[2] + m[1].slice(2) + (suffix ? ' · ' + suffix : '') : raw;
}

async function calculateSingleRoute(key, button) {
    const groups = optimizedRoutes || mapGroups();
    const orders = (groups.get(key)||[]).filter(p=>!excludedGeoOrders.has(String(p.id)));
    if (!orders.length || key.includes('SIN FECHA')) {
        toast('Esta ruta no tiene fecha o pedidos seleccionados'); return;
    }
    if (!map) initMap();
    button.disabled = true;
    try {
        routeLayers.filter(x => x.routeKey === key).forEach(x => map.removeLayer(x.layer));
        routeLayers = routeLayers.filter(x => x.routeKey !== key);
        const keys = [...groups.keys()];
        await requestRoadRoute(key, orders, ROUTE_COLORS[keys.indexOf(key) % ROUTE_COLORS.length]);
        const meta = [...document.querySelectorAll('[data-route-meta]')].find(x => x.dataset.routeMeta === key);
        if (meta) meta.textContent = routeSummaries.get(key);
        toast('Ruta ' + routeDisplayName(key) + ' calculada');
    } catch(e) { toast(e.message); }
    finally { button.disabled = false; }
}

function routeCard(key, color, orders, details = '') {
    const checked = routeVisibility.get(key) !== false;

    return `
        <div class="stop geo-route-card">
            <div class="geo-route-head">
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

                <button type="button" data-open-route="${esc(key)}" title="Ver mapa e indicaciones" style="border:0;background:transparent;font-weight:700;cursor:pointer;text-align:left">${esc(routeDisplayName(key))} · ${esc(orders[0]?.transportista || 'Sin asignar')}</button>
            </label>
            <button type="button" data-calc-route="${esc(key)}" title="Calcular únicamente esta ruta" class="geo-calc-route" aria-label="Calcular esta ruta">↻</button>
            </div>

            <div class="muted" data-route-meta="${esc(key)}">
                ${details || ''}
            </div>

            ${orders.map((p, i) => `
                <div class="geo-order-row ${excludedGeoOrders.has(String(p.id)) ? 'geo-order-excluded' : ''}">
                    <label><input type="checkbox" data-geo-order="${esc(String(p.id))}" ${excludedGeoOrders.has(String(p.id)) ? '' : 'checked'}> ${i + 1}. #${esc(p.numero)}
                    · ${esc(nameOf('clientes', p.cliente_id))}
                    · ${Number(
                        p.__bultos ??
                        orderProducts(p.id).reduce(
                            (s, x) => s + (+x.cantidad || 0),
                            0
                        )
                    ).toLocaleString('es-AR')} bultos</label>
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

    geoSetup();
    renderStoredRoutes();
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

        groupedStops(orders).forEach((stop,i)=>{
            const clients=stop.orders.map(p=>'#'+p.numero+' · '+nameOf('clientes',p.cliente_id)).join(' / ');
            const icon=L.divIcon({className:'order-marker',html:'<div style="background:'+color+';color:white;border:2px solid white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 1px 5px #555">'+(i+1)+(stop.orders.length>1?'×'+stop.orders.length:'')+'</div>',iconSize:[36,30],iconAnchor:[18,15]});
            const m=L.marker([stop.lat,stop.lng],{icon}).bindTooltip(esc(clients),{direction:'top'}).bindPopup('<b>Parada '+(i+1)+'</b><br>'+stop.orders.map(p=>esc('#'+p.numero+' · '+nameOf('clientes',p.cliente_id))).join('<br>'));
            if(stop.orders.every(p=>excludedGeoOrders.has(String(p.id))))m.setOpacity(.25);
            if(visible)m.addTo(map);
            ms.push(m);markers.push(m);
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
        !['ENTREGADO'].includes(p.estado) &&
        (p.latitud == null || p.longitud == null)
    );

    if (missing.length) {
        $('#stops').insertAdjacentHTML(
            'beforeend',
            `<p>${missing.length} pedidos pendientes sin coordenadas.
            Editá el pedido o la ficha del cliente.</p>`
        );
    }

    $('#stops').querySelectorAll('[data-open-route]').forEach(button => {
        button.onclick = () => openRouteDetails(button.dataset.openRoute);
    });
    $('#stops').querySelectorAll('[data-calc-route]').forEach(button => {
        button.onclick = () => calculateSingleRoute(button.dataset.calcRoute, button);
    });

    $('#stops')
        .querySelectorAll('[data-route-check]')
        .forEach(cb => {
            cb.onchange = () => toggleRoute(
                cb.dataset.routeCheck,
                cb.checked
            );
        });

    $('#stops').querySelectorAll('[data-geo-order]').forEach(cb => cb.onchange = () => {
        if (cb.checked) excludedGeoOrders.delete(cb.dataset.geoOrder);
        else excludedGeoOrders.add(cb.dataset.geoOrder);
        optimizedRoutes = null;
        persistGeoRoutes();
        drawMap();
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
    orders=orders.filter(p=>!excludedGeoOrders.has(String(p.id)));
    if (!orders.length) return;

    const coords = [
        `${DEPOT.lng},${DEPOT.lat}`,
        ...groupedStops(orders).map(p => `${p.lng},${p.lat}`),
        `${DEPOT.lng},${DEPOT.lat}`
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
        `${(j.routes[0].distance / 1000).toFixed(1)} km ida y vuelta · ` +
        `${Math.round(j.routes[0].duration / 60)} min · ` +
        geoFuelSummary(j.routes[0].distance / 1000)
    );
    if(!key.startsWith('OPT-'))await saveRealRoute(key,orders,j.routes[0]);
}


$('#geoRefresh').onclick = async () => {
 const button=$('#geoRefresh');
 button.disabled=true;
 try {
  await loadAll();
  optimizedRoutes=null;
  routeVisibility.clear();
  routeSummaries.clear();
  const valid=new Set(cache.pedidos.map(p=>String(p.id)));
  for(const id of [...excludedGeoOrders])if(!valid.has(id))excludedGeoOrders.delete(id);
  persistGeoRoutes();
  drawMap();
  toast('Mapa actualizado desde los pedidos del calendario');
 }catch(e){toast('Error al recargar: '+e.message);}
 finally{button.disabled=false;}
};

$('#route').onclick = async () => {
    if (!map) initMap();

    optimizedRoutes = null;

    const groups = new Map([...mapGroups()].map(([k,ps])=>[k,ps.filter(p=>!excludedGeoOrders.has(String(p.id)))]).filter(([,ps])=>ps.length));

    const keys = [...groups.keys()]
        .filter(k => !k.startsWith('SIN FECHA'))
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
    const dated = new Map([...mapGroups()].map(([k,ps])=>[k,ps.filter(p=>!excludedGeoOrders.has(String(p.id)))]).filter(([,ps])=>ps.length));
    if (scope === 'planned') for (const key of [...dated.keys()]) if (key.startsWith('SIN FECHA')) dated.delete(key);
    if (scope === 'unplanned') {
        for (const key of [...dated.keys()]) if (!key.startsWith('SIN FECHA')) dated.delete(key);
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
    persistGeoRoutes();

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