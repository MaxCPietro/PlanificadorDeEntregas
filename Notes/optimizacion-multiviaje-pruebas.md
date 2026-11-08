# Sugerir distribución óptima — CVRP multiviaje (rama de prueba)

## Alcance
- Sólo optimiza pedidos con coordenadas y que no estén en estado `PENDIENTE - SIN LIBERAR`, ni entregados ni excluidos manualmente del mapa.
- Conserva el selector de alcance (planificados / sin planificar / todos) y la agrupación existente por fecha y transportista. No asigna transportistas ni fechas nuevas.
- Cada viaje sale del depósito, visita clientes y regresa al depósito. Se admiten varios viajes del mismo transportista en la misma fecha.
- **310 bultos por viaje**. **200 km y 240 minutos de conducción acumulados por jornada**, incluyendo todos los regresos al depósito.
- Los viajes se construyen mediante Clarke-Wright con matriz vial OSRM (distancia y duración) y se mejoran con 2-opt. Es una **heurística**, no garantiza el óptimo global.
- Se valida cada viaje contra OSRM /route y luego se consolidan varios viajes por jornada con best-fit decreciente. Los pedidos con fecha fija no se trasladan automáticamente a otro día; el excedente se informa como no asignable. Para pedidos sin fecha, se sugieren jornadas numeradas sin asignarles fecha concreta. Pedidos imposibles de asignar individualmente se informan para revisión manual.
- El botón genera una simulación en el mapa, **sin guardar rutas en Supabase**. No modificar la planificación real.

## Pruebas
1. Pedido pendiente sin liberar junto a uno liberado: sólo debe aparecer el liberado en la simulación.
2. 3 pedidos de 100 bultos: posible viaje de 300; sumar otro de 50 debe requerir otro viaje o redistribución.
3. Pedido único de 311 bultos: debe figurar como no asignable, nunca generar viaje sobrecargado.
4. Pedido único con 110 km desde depósito: si el regreso suma más de 200 km debe rechazarse.
5. Pedido con 130 minutos de ida: si la vuelta supera 240 minutos debe rechazarse.
6. Varios viajes en la misma fecha/transportista: verificar que todos vuelvan al depósito y que cada uno cumpla los tres límites.
7. OSRM caído o respuesta parcial: no debe reemplazar la sugerencia previa por una parcialmente calculada.
8. Validar que no haya escritura de rutas en Supabase y que el cálculo real (fuera de optimización) mantenga la persistencia original.
9. Validar filtros de alcance, pedidos sin fecha, coordenadas duplicadas, pedidos excluidos en mapa y comportamiento móvil.
10. Comprobar visualmente los km y minutos de cada viaje y contrastarlos con las restricciones.

## Consideraciones
- El límite de cuatro horas se aplica al tiempo **de conducción OSRM**, porque el sistema no guarda tiempos de descarga ni de espera. Si se requiere tiempo total operativo, incorporar tiempos de servicio como requisito adicional.
- El servicio público OSRM puede imponer límites de tamaño a las matrices y disponibilidad. Ante error, la simulación se cancela y no se relajan restricciones.
- El algoritmo de ahorros de Clarke-Wright no garantiza cantidad mínima de viajes ni asignación óptima entre varios transportistas; se mantiene la asignación por fecha/transportista del sistema.
- No se ha realizado una prueba extremo a extremo con pedidos reales ni navegador. Se requiere validación de aceptación antes de fusionar con main.

## Corrección 2026-11-08: presupuesto diario
- Regresión solicitada: pedidos #52 (51,6 km; 55 min), #48 (44,2 km; 47 min), #47 (43,7 km; 39 min), 300 bultos cada uno. Resultado esperado: **1 jornada, 3 viajes, 139,5 km y 141 min acumulados**.
- Caso adicional: cuatro viajes que superan presupuesto diario deben producir dos jornadas sugeridas si no tienen fecha, o rechazar el exceso si pertenecen a una fecha asignada.
- Validación defensiva: no admitir 0 km o 0 min para clientes geográficamente distintos del depósito.
- Se realizaron pruebas unitarias con valores sintéticos y verificación sintáctica; faltan pruebas de integración en navegador con OSRM y registros reales.

## Mejora del 8/11/2026: fechas sugeridas, FIFO y visualización por jornada
- Se muestra una sola tarjeta por jornada con los viajes internos, sus cargas, recorridos y retornos al depósito.
- La planificación de pedidos sin fecha propone fechas futuras a partir del día siguiente, omitiendo fines de semana, feriados nacionales disponibles en el calendario y fechas ya ocupadas por el mismo transportista.
- Las fechas aparecen como **Sugerido dd-mm-aa**. Son sólo sugerencias, no modifican \`fecha_entrega\` ni ningún registro SQL.
- La prioridad FIFO utiliza \`fecha_pedido\` ascendente. Para pedidos sin fecha, la consolidación primero junta viajes cortos y después ordena las jornadas por la antigüedad más alta contenida en ellas; con fecha fija, los pedidos más antiguos tienen prioridad para entrar.
- Validación de regresión sintética: #52 (51,6 km; 55 min; 300 bultos), #51 (13,4 km; 14 min; 300 bultos), #47 (43,7 km; 39 min; 300 bultos) -> **1 jornada; 3 viajes; 108,7 km; 108 minutos**.
- Caso agregado: un viaje más antiguo de 111,4 km y 160 bultos se asigna a una jornada anterior y #52/#51/#47 se consolidan en la siguiente jornada.
- Las pruebas son lógicas con datos de ejemplo. Antes de fusionar se requiere prueba integral con pedidos reales y OSRM.

## Mejora: presupuesto de 240 minutos OPERATIVOS (8/11/2026)
Se reemplaza el control por tiempo de conducción por una restricción dura de **240 minutos de operación por jornada**:

`tiempo_operativo_viaje = OSRM_min × factor_transito + minutos_carga_por_viaje + paradas_únicas × (min_descarga + min_espera)`.

- Valores **iniciales editables**: factor de tránsito **1,20**, carga **15 min por viaje**, descarga **20 min por parada**, espera **10 min por parada**.
- La carga se cuenta **una vez por viaje**, incluido el primero. La descarga y espera se aplican una vez por parada geográfica; si dos pedidos comparten coordenadas se considera una única parada (modelo simplificado).
- El conductor regresa al depósito entre viajes; los minutos viales de cada regreso están incluidos en OSRM.
- El factor 1,20 es una **hipótesis configurable** y no información de congestión en tiempo real.
- Se siguen manteniendo **310 bultos por viaje** y **200 km acumulados por jornada**.
- La restricción de 240 minutos se comprueba en la creación de viajes y en la consolidación de jornadas tras revalidar OSRM.
- Los parámetros están bajo **Tiempos operativos** en el mapa, guardados **sólo en LocalStorage**. Modificar un parámetro invalida la sugerencia anterior y exige ejecutar nuevamente la optimización. No hay cambios de SQL ni escritura de rutas.
- Los tiempos operativos y los minutos OSRM se distinguen en tarjetas, resumen y detalle.

### Casos de regresión ejecutados (sintéticos, no navegador)
- Un viaje de 40 km / 60 min OSRM, una parada: 72 min de conducción corregida + 15 carga + 20 descarga + 10 espera = **117 min operativos**.
- Cuatro pedidos (#52, #47, #48, #51) con los tramos publicados en la captura previa y los defaults: **2 jornadas**: primera 57,1 km y 152,4 min operativos (#51, #47), segunda 95,3 km y 211,2 min (#48, #52). Los valores dependerán de la ubicación y del OSRM real.
- Si el tiempo operativo de un viaje excede 240 min, debe declararse no asignable y nunca entrar en una jornada.
- Paradas de dos pedidos con las mismas coordenadas: una sola descarga/espera.
- Revisar en navegador real antes de merge; validar render responsive, tiempos de servicio apropiados y disponibilidad de OSRM.

### Límites del modelo
No se incluyen disponibilidad horaria del cliente, descansos, feriados locales no reportados, ni carga proporcional al número de bultos. Los tiempos de descarga y espera son fijos por parada hasta que existan datos observados.
