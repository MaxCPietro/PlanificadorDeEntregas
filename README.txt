PLANIFICADOR DE ENTREGAS V6 — SUPABASE
=====================================

QUÉ INCLUYE
- index.html: estructura HTML de la aplicación.
- styles.css: estilos visuales y diseño adaptable a móviles.
- app.js: lógica JavaScript del planificador, formularios, base de datos, calendario y mapa.
- config.js: lugar donde pegar la URL del proyecto Supabase y la clave publicable (anon/publishable).
- schema.sql: crea las cinco tablas relacionales, índices, políticas de seguridad y datos de demostración.

MODELO RELACIONAL
- clientes (PK id)
- vendedores (PK id)
- productos (PK id)
- pedidos (PK id; FK cliente_id -> clientes.id; FK vendedor_id -> vendedores.id)
- pedido_productos (PK id; FK pedido_id -> pedidos.id; FK producto_id -> productos.id)
La tabla pedido_productos resuelve la relación muchos-a-muchos entre pedidos y productos y guarda cantidad y precio unitario.

CONFIGURACIÓN (una sola vez)
1. Entrá en https://supabase.com/ y creá una cuenta/proyecto en el plan gratuito.
2. En el proyecto, abrí SQL Editor, creá una consulta nueva, pegá TODO el contenido de schema.sql y ejecutalo.
3. En Project Settings > API (o Connect), copiá la Project URL y la clave publicable/anon. No uses service_role ni una clave secreta en el navegador.
4. Abrí config.js y reemplazá PEGAR_URL_DEL_PROYECTO y PEGAR_CLAVE_PUBLICABLE por esos dos valores.
5. En Supabase > Authentication > Users, creá un usuario con email y contraseña para cada persona que vaya a ingresar. Si el proyecto requiere confirmación de email, confirmá la cuenta antes de entrar.
6. Publicá juntos los archivos index.html, styles.css, app.js y config.js en un hosting estático HTTPS (por ejemplo, Netlify o GitHub Pages), o probá localmente con un servidor estático. No hace falta publicar schema.sql.
7. Abrí el sitio e ingresá con el usuario creado.

CÓMO USAR
- En Clientes, cargá los clientes. Se pueden buscar coordenadas desde la dirección y corregirlas manualmente.
- En Vendedores y Productos, mantené los catálogos.
- En Nuevo pedido, elegí el cliente: se completan automáticamente dirección, localidad, provincia y coordenadas desde la ficha del cliente. Se pueden ajustar para una entrega específica.
- Agregá uno o más productos con cantidad y precio unitario. Se guardan en pedido_productos.
- Arrastrá los pedidos al día correspondiente en el calendario.
- En Mapa de pendientes, se muestran los pedidos con coordenadas que no estén entregados/no entregados. El botón calcula distancia vial estimada y tiempo por el orden actual de las paradas.

SEGURIDAD Y LIMITACIONES
- Las tablas usan Row Level Security (RLS) y las políticas permiten operaciones solo a usuarios autenticados. No desactives RLS.
- Todos los usuarios autenticados de ESTE proyecto comparten los mismos datos y tienen permisos de lectura/escritura. Para separar permisos por vendedor o por rol, se deben crear políticas RLS más específicas.
- La clave publicable/anon puede estar en config.js; NUNCA publiques service_role o claves secretas.
- El plan gratuito de Supabase tiene límites y condiciones que pueden cambiar; consultá su página de precios actual.
- Geocodificación usa Nominatim/OpenStreetMap y rutas usa el servicio público OSRM. Requieren internet, tienen límites de uso y no garantizan disponibilidad; no son APIs comerciales con SLA.
- Las distancias/tiempos son estimaciones sin tráfico en vivo y el orden de paradas no se optimiza automáticamente.
- La aplicación no incluye aún asignación de usuarios a vendedores, permisos por rol, importación masiva, facturación ni sincronización con sistemas externos.
- Los registros cargados por SQL son ejemplos ficticios y deben reemplazarse/verificarse antes de operar.


ACTUALIZACIÓN DE FUNCIONES
- Número de pedido numérico automático: siguiente al mayor número existente. Los números previos no numéricos de demostración no se toman como secuencia.
- En el detalle del pedido, precio unitario, descuento porcentual y total por línea; el total descuenta el porcentaje. Ejecutá el schema.sql actualizado para agregar descuento_pct si ya tenías la base creada.
- El botón Imprimir / Exportar PDF abre la impresión del navegador: elegí Guardar como PDF para exportarlo.
- Un pedido programado para hoy pasa a EN REPARTO al guardarlo. Los pedidos ENTREGADO permanecen visibles en el calendario.
- El mapa usa como partida el depósito de Pilar y colorea por separado las rutas de cada fecha y la ruta sin fecha. Coordenadas del depósito aproximadas; verificá el punto antes de usarlo operativamente.
- En la tabla de Productos se muestran código, nombre y activo; descripción y precio se mantienen en la ficha para no romper datos previos.


MEJORAS V6.1
- Conexión visual con estado y colores mejorados.
- Mapa: los pedidos sin fecha no calculan recorridos; solo se ven sus puntos.
- Cada ruta/puntos tiene checkbox de visibilidad.
- Botón de distribución sugerida con límite de 310 bultos por viaje. Usa agrupación por capacidad y vecino más cercano; es heurística y requiere revisión operativa. Cantidad de producto se interpreta como bultos.
- Clientes: grilla muestra todos los campos de la tabla, incluida dirección de entrega.
- Nuevo pedido: selector modal de productos con búsqueda y checkboxes.
- Nuevo campo tipo de pago: Contado, Cuenta Corriente, Echeq u Otro.
- Impresión/PDF con formato mejorado.

IMPORTANTE: si la base ya existe, ejecutar migracion_v6_1.sql antes de usar la nueva versión. Para instalaciones nuevas, schema.sql ya incluye los campos nuevos. La heurística de rutas no garantiza el óptimo global. Verificar coordenadas del depósito y direcciones de entrega.
