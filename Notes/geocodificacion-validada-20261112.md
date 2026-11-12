# Geocodificación validada — rama de pruebas

## Objetivo

Evitar que el Planificador de Entregas seleccione silenciosamente el primer
resultado de Nominatim cuando la localidad, calle o altura no coinciden.
Caso de regresión: `Ecuador 3109, San Martín, Buenos Aires` no debe admitir
un resultado de otra localidad, como la coordenada
`-36.7510999, -62.9528788`.

## Cambios

- Buscador compartido para formularios de pedidos y clientes.
- Búsqueda manual con Nominatim, hasta cinco resultados, con `addressdetails=1`.
- `viewbox` preferente AMBA (no restringe entregas fuera del área).
- Validación de calle, localidad, provincia y altura si la fuente informa ese dato.
- Selección explícita de un candidato. No hay selección automática.
- Si no hay candidatos confiables, no se rellenan las coordenadas.
- Botón para consultar la **dirección** en Google Maps y copiar las coordenadas manualmente.
- Confirmación manual de coordenadas con fuente `nominatim` o `manual`.
- Borrar coordenadas anteriores al cambiar la dirección o localidad.
- Bloquear el guardado de coordenadas nuevas/editadas mientras no estén confirmadas.
- Caché de búsquedas por dirección y separación de al menos 1,1 segundos entre solicitudes del mismo navegador.
- Persistencia de `geo_fuente` y `geo_verificada` en clientes y pedidos. Las coordenadas históricas pasan a considerarse no verificadas.

## Despliegue

**NO ejecutar esta rama en producción antes de aplicar la migración**:

`Supabase/migrations/20261112_geocodificacion_validada.sql`

1. Revisar y ejecutar la migración en un entorno de pruebas.
2. Validar el comportamiento de pedidos y clientes.
3. Hacer merge de la rama y aplicar la migración en producción antes del frontend.
4. Verificar el mecanismo existente de invalidación de caché de la web.

La migración está versionada en GitHub, **no fue aplicada a Supabase productivo**.

## Casos de prueba

1. Buscar Ecuador 3109, San Martín, Buenos Aires. Un resultado de Puan u otra localidad **no** debe mostrarse como válido.
2. Una coincidencia Ecuador 3109 en General San Martín puede seleccionarse, pero requiere confirmar antes de guardar.
3. Una coincidencia con altura diferente se descarta.
4. Una coincidencia sin altura identificada se marca como aproximada y requiere verificación visual.
5. Cambiar localidad o dirección limpia las coordenadas previas.
6. Escribir latitud y longitud manuales y guardar sin confirmar debe impedir el guardado.
7. Buscar la dirección en Google Maps, copiar coordenadas y confirmar: deben conservarse con `geo_fuente='manual'`.
8. Al seleccionar un cliente existente con coordenadas verificadas, deben heredarse los atributos correspondientes en pedidos.
9. Repetir una búsqueda idéntica debe utilizar el caché de sesión.
10. Comprobar el diseño responsive de ambos formularios.

### Limitaciones

- La exactitud depende de los datos disponibles en OSM. Una coincidencia no certifica físicamente el punto de acceso al negocio.
- No se extraen coordenadas de Google Maps automáticamente y no se utiliza Google Maps API.
- El estado `geo_verificada` significa **confirmación del usuario**, no auditoría externa.
- La validación localiza calles y localidades en las etiquetas devueltas por Nominatim; ciertas direcciones legítimas de localidades con nombres alternativos pueden necesitar confirmación manual.
- No hay geocodificación masiva ni se trasladan coordenadas históricas sin revisión.

## Corrección de altura e importación de enlaces — 12/11/2026

- Un resultado de Nominatim sin `house_number` **no se considera exacto** si la dirección solicitada contiene una altura.
- Una altura diferente también se rechaza. Las coincidencias parciales se muestran como referencias de calle, **sin botón «Usar este punto»**.
- En pedidos y clientes se agregó «Pegá un enlace completo de Google Maps» y «Extraer coordenadas del enlace».
- Solo se aceptan URLs de dominios Google Maps admitidos y con coordenadas inequívocas del **destino**: `!3dLAT!4dLNG`, parámetros `q`, `query`, `destination`, `daddr` numéricos, o rutas `/maps/search/LAT,LNG` y `/maps/place/LAT,LNG`.
- No se acepta `@lat,lng`: identifica el **centro de la cámara**, no necesariamente el domicilio.
- No se aceptan enlaces abreviados `maps.app.goo.gl` ni `goo.gl`: sin resolver la redirección no es posible comprobar las coordenadas del destino.
- La importación **no marca el punto como verificado**: exige confirmación explícita del usuario antes de guardar.
- Las coordenadas importadas se registran con fuente `manual`; no requieren migración SQL adicional.

### Casos para probar en localhost

1. Ecuador 3109 con resultado Nominatim «33 - Ecuador» debe aparecer solo como referencia parcial, sin selección.
2. Un candidato Ecuador 515 tampoco debe poder seleccionarse para Ecuador 3109.
3. Pegar `https://www.google.com/maps/search/?api=1&query=-34.551328%2C-58.530750`: extraer coordenadas y pedir confirmación.
4. Pegar un enlace que solo contenga `/@-34.551328,-58.530750,17z`: rechazar por centro de mapa.
5. Pegar `https://maps.app.goo.gl/...`: solicitar URL completa.
6. Pegar un enlace de un dominio ajeno a Google: rechazar.
7. Confirmar coordenadas, guardar y reabrir pedido/cliente: conservar latitud, longitud y estado verificado.

**Estado de pruebas:** sintaxis JS validada y comprobaciones unitarias de coincidencia de alturas ejecutadas; las URLs requieren prueba funcional en navegador.
