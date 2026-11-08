# Sugerir distribución óptima — CVRP multiviaje (rama de prueba)

## Alcance
- Sólo optimiza pedidos con coordenadas y que no estén en estado `PENDIENTE - SIN LIBERAR`, ni entregados ni excluidos manualmente del mapa.
- Conserva el selector de alcance (planificados / sin planificar / todos) y la agrupación existente por fecha y transportista. No asigna transportistas ni fechas nuevas.
- Cada viaje sale del depósito, visita clientes y regresa al depósito. Se admiten varios viajes del mismo transportista en la misma fecha.
- Restricciones **por viaje**: máximo 310 bultos, 200 km ida y vuelta y 240 minutos de conducción ida y vuelta.
- Los viajes se construyen mediante Clarke-Wright con matriz vial OSRM (distancia y duración) y se mejoran con 2-opt. Es una **heurística**, no garantiza el óptimo global.
- Se valida cada viaje contra la respuesta final de OSRM /route antes de publicar el conjunto de sugerencias. Pedidos imposibles de asignar individualmente se informan para revisión manual.
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
