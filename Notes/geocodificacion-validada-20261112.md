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
