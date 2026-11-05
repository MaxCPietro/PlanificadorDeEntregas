-- Carga del Maestro de Productos desde Stock-2 - MaestroProductos.csv
-- Compatible con el esquema de public.productos del Planificador V6.1 (Supabase/PostgreSQL).
-- Se omite la fila de relleno "FALTA".
-- codigo = IDMestroP (clave estable y única del archivo).
-- precio se inicia en 0 porque el CSV no contiene precios.
-- Los metadatos adicionales se conservan en descripcion.
-- Reejecutable: actualiza los productos existentes por codigo.

BEGIN;

INSERT INTO public.productos (codigo, nombre, descripcion, precio, activo)
VALUES
  ('01.001', 'Cabarceno - Vino Patero Blanco - Caja 6u. x 700cc', 'ID Producto: 001 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 160', 0, FALSE),
  ('01.062', 'Cabarceno - Vino Patero Blanco - Caja 6u. x 750cc', 'ID Producto: 062 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.002', 'Cabarceno - Vino Patero Rosado - Caja 6u. x 700cc', 'ID Producto: 002 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 160', 0, TRUE),
  ('01.044', 'Cabarceno - Vino Patero Tinto - Caja 6u. x 750cc', 'ID Producto: 044 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.004', 'Cabarceno - Vino Patero Blanco - Caja 6u. x 1125cc', 'ID Producto: 004 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 100', 0, TRUE),
  ('01.005', 'Cabarceno - Vino Patero Rosado - Caja 6u. x 1125cc', 'ID Producto: 005 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 100', 0, TRUE),
  ('01.006', 'Cabarceno - Vino Patero Tinto - Caja 6u. x 1125cc', 'ID Producto: 006 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 100', 0, TRUE),
  ('01.007', 'Cabarceno - Vino Patero Tinto - Caja 1u. x 3000cc', 'ID Producto: 007 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 210', 0, TRUE),
  ('01.071', 'Cabarceno Clásico - Vino Blanco - Caja 6u. x 750cc', 'ID Producto: 071 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.072', 'Cabarceno Clásico - Vino Tinto - Caja 6u. x 750cc', 'ID Producto: 072 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.073', 'Cabarceno Clásico - Vino Blanco - Caja 6u. x 1125cc', 'ID Producto: 073 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 100', 0, TRUE),
  ('01.074', 'Cabarceno Clásico - Vino Tinto - Caja 6u. x 1125cc', 'ID Producto: 074 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 100', 0, TRUE),
  ('01.075', 'Bodega Familia Fantelli - Mas Vale Tarde Que Nunca- Blanc de Blanc - Caja 6u. X 750cc', 'ID Producto: 075 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.076', 'Bodega Familia Fantelli - Mas Vale Tarde Que Nunca - Red Wine - Caja 6u. X 750cc', 'ID Producto: 076 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.077', 'Bodega Familia Fantelli - Mas Vale Tarde Que Nunca - Malbec - Caja 6u. X 750cc', 'ID Producto: 077 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.010', 'Bodega Familia Fantelli - 2x4 Tango - Chardnonnay - Caja  6u. x 750cc', 'ID Producto: 010 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.011', 'Bodega Familia Fantelli - 2x4 Tango - Malbec - Caja 6u. x 750cc', 'ID Producto: 011 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.012', 'Bodega Familia Fantelli - 2x4 Tango - Cabernet Sauvignon - Caja 6u. x 750cc', 'ID Producto: 012 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.013', 'Bodega Familia Fantelli - Moscato - Caja 6u. x 750 cc', 'ID Producto: 013 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.014', 'Bodega Familia Fantelli - Mistela - Caja 6u. x 750 cc', 'ID Producto: 014 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.015', 'Bodega Familia Fantelli - Jugo de Uva - Caja 6u. x 750 cc', 'ID Producto: 015 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.017', 'Bodega Familia Fantelli - Cosecha Tardía Blanco - Caja 6u. x 750cc', 'ID Producto: 017 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.045', 'Bodega Familia Fantelli - Cosecha Tardía Tinto- Caja 6u. x 500cc', 'ID Producto: 045 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 210', 0, TRUE),
  ('01.018', 'Bodega Familia Fantelli - Cosecha Anticipada Candy  Blanco - Caja 6u. x 750cc', 'ID Producto: 018 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.019', 'Bodega Familia Fantelli - Cosecha Anticipada Candy Rosado - Caja 6u. x 750cc', 'ID Producto: 019 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.027', 'Bodega Familia Fantelli - Serie Varietal - Chardonnay - Caja 6u. x 750cc', 'ID Producto: 027 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, FALSE),
  ('01.028', 'Bodega Familia Fantelli - Serie Varietal - Malbec - Caja 6u. x 750cc', 'ID Producto: 028 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.029', 'Bodega Familia Fantelli - Serie Varietal - Cabernet Sauvignon - Caja 6u. x 750cc', 'ID Producto: 029 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.034', 'Bodega Familia Fantelli - Serie Varietal - Malbec Botellón - Caja 1u. x 3000cc', 'ID Producto: 034 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.035', 'Bodega Familia Fantelli - Serie Magno - Chardonnay - Caja 6u. x 750cc', 'ID Producto: 035 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.036', 'Bodega Familia Fantelli - Serie Magno - Malbec - Caja 6u. x 750cc', 'ID Producto: 036 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.037', 'Bodega Familia Fantelli - Serie Magno - Cabernet Sauvignon - Caja 6u. x 750cc', 'ID Producto: 037 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.038', 'Bodega Familia Fantelli - Serie Premium Gran Reserva - Caja 6u. x 750 cc', 'ID Producto: 038 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.039', 'Bodega Familia Fantelli - Serie Premium Gran Reserva - Malbec - Caja 6u. x 750 cc', 'ID Producto: 039 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, FALSE),
  ('01.040', 'Bodega Familia Fantelli - Serie Premium Gran Reserva - Pinot Noir - Caja 6u. x 750 cc', 'ID Producto: 040 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('01.043', 'Bodega Familia Fantelli - Serie Premium Gran Reserva - Malbec/Pinot Noir - Caja 6u. x 750 cc', 'ID Producto: 043 | Proveedor: Fantelli | ID Proveedor: 01 | Tipo de conteo: Caja | Pallet: 150', 0, FALSE),
  ('02.001', 'Olivi - Aceite de Pepitas de Uva - Botella vidrio - Caja 12u. x 250 ml', 'ID Producto: 001 | Proveedor: Olivi | ID Proveedor: 02 | Tipo de conteo: Caja | Pallet: 100', 0, TRUE),
  ('02.002', 'Olivi - Aceite de Pepitas de Uva - Botella vidrio - Caja 6u. x 500 ml', 'ID Producto: 002 | Proveedor: Olivi | ID Proveedor: 02 | Tipo de conteo: Caja | Pallet: 100', 0, FALSE),
  ('02.004', 'Olivi - Aceite de Pepitas de Uva - Botella Pet - Caja 12u. x 1000 ml', 'ID Producto: 004 | Proveedor: Olivi | ID Proveedor: 02 | Tipo de conteo: Caja | Pallet: 100', 0, FALSE),
  ('02.007', 'Olivi - Aceite de Oliva Virgen Extra Premium - Botella vidrio - Caja 12u. x 250 ml', 'ID Producto: 007 | Proveedor: Olivi | ID Proveedor: 02 | Tipo de conteo: Caja | Pallet: 100', 0, FALSE),
  ('02.008', 'Olivi - Aceite de Oliva Virgen Extra Premium - Botella vidrio - Caja 6u. x 500 ml', 'ID Producto: 008 | Proveedor: Olivi | ID Proveedor: 02 | Tipo de conteo: Caja | Pallet: 100', 0, FALSE),
  ('99.052', 'Fernet Branca - Caja 12u. x 450cc', 'ID Producto: 052 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Caja | Pallet: 140', 0, TRUE),
  ('99.016', 'Fernet Branca - Caja 6u. x 750cc', 'ID Producto: 016 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Caja | Pallet: 140', 0, FALSE),
  ('99.061', 'Fernet Branca - Caja 12u. x 750cc', 'ID Producto: 061 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Caja | Pallet: 140', 0, TRUE),
  ('99.017', 'Fernet Branca - Caja 6u. x 1000cc', 'ID Producto: 017 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Caja | Pallet: 88', 0, TRUE),
  ('99.037', 'Jameson - Irish Whiskey - Caja 12u. x 700cc', 'ID Producto: 037 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Botella | Pallet: 80', 0, TRUE),
  ('99.047', 'Gin - Desertor del Tiempo - London Dry - Caja 6u x 750cc', 'ID Producto: 047 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Botella | Pallet: 100', 0, FALSE),
  ('99.048', 'Gin - Desertor del Tiempo - Pink Edition (Frutos Rojos) - Caja 6u x 750cc', 'ID Producto: 048 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Botella | Pallet: 100', 0, FALSE),
  ('99.053', 'Americano Gancia - Caja 12u. x 950cc', 'ID Producto: 053 | Proveedor: Otro | ID Proveedor: 99 | Tipo de conteo: Caja | Pallet: 140', 0, TRUE),
  ('03.038', 'Destilería Caesar - Musianum - Grappa Jóven de Malbec  - Caja 4u. x 500 cc', 'ID Producto: 038 | Proveedor: Dest. Caesar | ID Proveedor: 03 | Tipo de conteo: Caja | Pallet: 500', 0, TRUE),
  ('03.063', 'Destilería Caesar - Musianum - Grappa de Guarda - Caja 1u. x 500 cc [Botella Soplada]', 'ID Producto: 063 | Proveedor: Dest. Caesar | ID Proveedor: 03 | Tipo de conteo: Botella | Pallet: FALTA', 0, TRUE),
  ('03.039', 'Destilería Caesar - Musianum - Grappa de Guarda - Caja 1u. x 50 cc [Botella Soplada]', 'ID Producto: 039 | Proveedor: Dest. Caesar | ID Proveedor: 03 | Tipo de conteo: Botella | Pallet: 100', 0, TRUE),
  ('05.045', 'Vientos de Altura - Extra Brutt - Caja 6u x 750 cc', 'ID Producto: 045 | Proveedor: Fecovita | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 140', 0, TRUE),
  ('05.046', 'Vientos de Altura - Reserva Malbec - Caja 6u x 750cc', 'ID Producto: 046 | Proveedor: Fecovita | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 100', 0, FALSE),
  ('04.049', 'Correa Grieco - Jugo de Uva - Caja 6u. x 500 cc', 'ID Producto: 049 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 210', 0, TRUE),
  ('04.050', 'Correa Grieco - Jugo de Uva - Caja 6u. x 750 cc', 'ID Producto: 050 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('04.051', 'Correa Grieco - Cosecha Tardía Blanco - Caja 6u. x 750cc', 'ID Producto: 051 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('04.054', 'Correa Grieco - Serie Varietal - Chardonnay - Caja 6u. x 750cc', 'ID Producto: 054 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('04.055', 'Correa Grieco - Serie Varietal - Malbec - Caja 6u. x 750cc', 'ID Producto: 055 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('04.056', 'Correa Grieco - Serie Varietal - Cabernet Franc - Caja 6u. x 750cc', 'ID Producto: 056 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('04.071', 'Correa Grieco - Serie Varietal - Ancelotta - Caja 6u. x 750cc', 'ID Producto: 071 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, FALSE),
  ('04.072', 'Correa Grieco - Serie Varietal - Freisa - Caja 6u. x 750cc', 'ID Producto: 072 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, FALSE),
  ('04.073', 'Correa Grieco - Serie Varietal - Tannat - Caja 6u. x 750cc', 'ID Producto: 073 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, FALSE),
  ('04.057', 'Correa Grieco - Bivarietal Reserva - Malbec/Pinot Noir - Caja 6u. x 750cc', 'ID Producto: 057 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('04.058', 'Correa Grieco - Bivarietal Reserva - Bonarda/Petit Verdot - Caja 6u. x 750cc', 'ID Producto: 058 | Proveedor: Correa Grieco | ID Proveedor: 04 | Tipo de conteo: Caja | Pallet: 150', 0, TRUE),
  ('05.059', 'Spirits of Argentina - Gin Curve London Dry - Botella 1u. x 750cc', 'ID Producto: 059 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.060', 'Spirits of Argentina - Gin Pearl London Dry - Botella 1u. x 750cc', 'ID Producto: 060 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.064', 'Spirits of Argentina - Gin William of Orange "Naranja" - Botella 1u. x 750cc', 'ID Producto: 064 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.065', 'Spirits of Argentina - Gin Bendita & Salvaje - "Rosas y Limón"- Botella 1u. x 750cc', 'ID Producto: 065 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.066', 'Spirits of Argentina - Gin Bendita & Salvaje - "Rosas y Pomelo"- Botella 1u. x 750cc', 'ID Producto: 066 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.067', 'Spirits of Argentina - Gin Bendita & Salvaje - "Rosas y Jazmín"- Botella 1u. x 750cc', 'ID Producto: 067 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.068', 'Spirits of Argentina - Vodka 54 - Botella 1u. x 750cc', 'ID Producto: 068 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.069', 'Spirits of Argentina - Pisco Malbec - El jardín de los Venenos - Botella 1u. x 750cc', 'ID Producto: 069 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE),
  ('05.070', 'Spirits of Argentina - Licor de Hierbas Matalobos - Botella 1u. x 750cc', 'ID Producto: 070 | Proveedor: Spirits of Argentina | ID Proveedor: 05 | Tipo de conteo: Botella | Pallet: 120', 0, TRUE)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  activo = EXCLUDED.activo;

COMMIT;

-- Verificación:
-- SELECT COUNT(*) AS total_productos FROM public.productos;
-- SELECT codigo, nombre, activo FROM public.productos ORDER BY codigo;
