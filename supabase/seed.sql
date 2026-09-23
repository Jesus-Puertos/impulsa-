-- =============================================================================
-- seed.sql - Datos iniciales de Cooperativa Impulsa
--
-- Se ejecuta solo con `supabase db reset` en el entorno local. Para producción
-- aplícalo una vez a mano (ver `docs/02-supabase-setup.md`).
--
-- Es idempotente: todos los INSERT llevan ON CONFLICT, así que puede volver a
-- ejecutarse sin duplicar nada.
--
-- IMPORTANTE: las tasas, montos y plazos de abajo son valores de arranque
-- plausibles, NO las condiciones reales autorizadas por el Consejo. Ajústalos
-- desde /admin > Productos antes de salir a producción.
-- =============================================================================

-- =============================================================================
-- PARAMETROS DEL SISTEMA
-- =============================================================================
insert into configuracion (clave, valor, descripcion, grupo, editable) values
  ('nombre_cooperativa', '"Cooperativa Impulsa"',
   'Razón social corta usada en la interfaz.', 'general', true),
  ('razon_social', '"Cooperativa Impulsa, S.C. de A.P. de R.L. de C.V."',
   'Denominación completa para documentos oficiales.', 'general', true),
  ('rfc_cooperativa', '"XAXX010101000"',
   'RFC de la cooperativa. Reemplazar por el real.', 'general', true),
  ('correo_contacto', '"contacto@cooperativaimpulsa.mx"',
   'Buzón que recibe los avisos del formulario de contacto.', 'contacto', true),
  ('telefono_contacto', '"+52 272 000 0000"',
   'Teléfono principal de atención a socios.', 'contacto', true),
  ('whatsapp_contacto', '"+52 272 000 0000"',
   'Número de WhatsApp para atención.', 'contacto', true),
  ('direccion_matriz', '"Zongolica, Veracruz, México"',
   'Domicilio de la oficina matriz.', 'contacto', true),

  ('iva_intereses_pct', '0',
   'IVA aplicado a los intereses ordinarios. 0 mientras los intereses estén exentos.',
   'credito', true),
  ('dias_gracia_mora', '3',
   'Días después del vencimiento antes de generar interés moratorio.', 'credito', true),
  ('tasa_moratoria_default', '36',
   'Tasa moratoria anual por omisión para productos nuevos.', 'credito', true),
  ('capacidad_pago_maxima', '0.35',
   'Fracción máxima del ingreso disponible comprometible en un pago.', 'credito', true),
  ('monto_maximo_sin_aval', '30000',
   'Monto por encima del cual se exige aval.', 'credito', true),
  ('aportacion_social_minima', '500',
   'Aportación al capital social requerida para ser socio.', 'socios', true),
  ('antiguedad_minima_credito_meses', '3',
   'Meses como socio activo antes de poder solicitar crédito.', 'credito', true),

  ('admin_bootstrap_email', '"direccion@cooperativaimpulsa.mx"',
   'Este correo recibe el rol admin al registrarse. Debe coincidir con ADMIN_BOOTSTRAP_EMAIL del .env.',
   'seguridad', false)
on conflict (clave) do nothing;

-- =============================================================================
-- SUCURSALES
-- =============================================================================
insert into sucursales (clave, nombre, calle, numero, colonia, municipio, estado,
                        codigo_postal, telefono, correo, horario, es_matriz, orden)
values
  ('SUC-MATRIZ', 'Matriz Zongolica', 'Av. Miguel Hidalgo', '120', 'Centro',
   'Zongolica', 'Veracruz', '95000', '+52 272 000 0000',
   'matriz@cooperativaimpulsa.mx', 'Lunes a viernes 9:00 - 17:00, sábados 9:00 - 13:00',
   true, 1),
  ('SUC-ORIZABA', 'Sucursal Orizaba', 'Calle Sur 5', '48', 'Centro',
   'Orizaba', 'Veracruz', '94300', '+52 272 000 0001',
   'orizaba@cooperativaimpulsa.mx', 'Lunes a viernes 9:00 - 17:00',
   false, 2),
  ('SUC-TEZONAPA', 'Sucursal Tezonapa', 'Av. Juárez', '15', 'Centro',
   'Tezonapa', 'Veracruz', '95040', '+52 272 000 0002',
   'tezonapa@cooperativaimpulsa.mx', 'Lunes a viernes 9:00 - 16:00',
   false, 3)
on conflict (clave) do nothing;

-- =============================================================================
-- PRODUCTOS DE CREDITO
-- =============================================================================
insert into productos_credito (
  clave, nombre, descripcion, descripcion_larga,
  monto_minimo, monto_maximo, plazo_minimo_periodos, plazo_maximo_periodos,
  tasa_anual, tasa_moratoria_anual, comision_apertura_pct, periodicidad,
  requiere_aval, requiere_garantia, ingreso_minimo_mensual, factor_capacidad_pago,
  requisitos, destinos, icono, color, destacado, orden
) values
  ('CRED-PERSONAL', 'Crédito Personal Impulsa',
   'Para lo que necesites resolver hoy, con pagos fijos y sin letras chiquitas.',
   'Un crédito de libre destino pensado para gastos familiares, salud, educación o imprevistos. La cuota es fija durante todo el plazo, así sabes exactamente cuánto pagas cada mes desde el primer día.',
   3000, 60000, 6, 36, 28.0, 42.0, 2.0, 'mensual',
   false, false, 4000, 0.350,
   array['Ser socio activo con al menos 3 meses de antigüedad',
         'Identificación oficial vigente (INE)',
         'CURP y comprobante de domicilio no mayor a 3 meses',
         'Comprobante de ingresos de los últimos 3 meses'],
   array['Gastos familiares', 'Salud', 'Educación', 'Mejoras al hogar', 'Imprevistos'],
   'credit-card', 'primary', true, 1),

  ('CRED-PYME', 'Crédito Productivo',
   'Capital de trabajo para tu negocio, tu parcela o tu taller.',
   'Financiamiento para socios con actividad productiva: compra de insumos, herramienta, inventario o equipo. El plazo y la periodicidad se ajustan al ciclo de tu actividad, incluyendo pagos quincenales para comercio y mensuales para producción agrícola.',
   10000, 250000, 6, 48, 24.0, 36.0, 2.5, 'mensual',
   true, false, 8000, 0.400,
   array['Ser socio activo con al menos 6 meses de antigüedad',
         'Comprobante de actividad productiva o alta en el SAT',
         'Identificación oficial vigente (INE) del solicitante y del aval',
         'Comprobante de domicilio del negocio'],
   array['Capital de trabajo', 'Compra de insumos', 'Herramienta y equipo', 'Inventario'],
   'briefcase', 'campo', true, 2),

  ('CRED-AGRICOLA', 'Crédito Agrícola de Ciclo',
   'Financia tu ciclo productivo y paga cuando levantes la cosecha.',
   'Diseñado para productores de café, caña y maíz de la región. El calendario de pagos se alinea con el ciclo agrícola, con posibilidad de amortizar principalmente al momento de la venta de la cosecha.',
   8000, 150000, 6, 24, 22.0, 36.0, 2.0, 'mensual',
   true, true, 5000, 0.400,
   array['Ser socio activo con al menos 6 meses de antigüedad',
         'Acreditar la posesión o renta de la parcela',
         'Identificación oficial vigente (INE)',
         'Aval solidario que sea socio de la cooperativa'],
   array['Insumos agrícolas', 'Jornales', 'Renta de maquinaria', 'Habilitación de parcela'],
   'globe', 'campo', false, 3),

  ('CRED-EMERGENTE', 'Crédito Emergente',
   'Hasta $15,000 con respuesta en 24 horas para cuando no puede esperar.',
   'Un crédito de monto reducido y trámite simplificado para emergencias médicas o familiares. Se resuelve con el expediente que ya tienes como socio activo, sin aval y sin garantía.',
   1500, 15000, 3, 12, 32.0, 48.0, 0.0, 'quincenal',
   false, false, 3000, 0.300,
   array['Ser socio activo con al menos 3 meses de antigüedad',
         'No tener créditos con atraso mayor a 30 días',
         'Identificación oficial vigente (INE)'],
   array['Emergencia médica', 'Gastos funerarios', 'Reparación urgente'],
   'bolt', 'oro', false, 4),

  ('CRED-VIVIENDA', 'Crédito para Mejoramiento de Vivienda',
   'Amplía, repara o termina tu casa con plazos de hasta 5 años.',
   'Para ampliación, reparación o terminación de vivienda. Los montos mayores requieren garantía y comprobación del destino mediante facturas de material o avance de obra.',
   20000, 400000, 12, 60, 21.0, 36.0, 3.0, 'mensual',
   true, true, 10000, 0.350,
   array['Ser socio activo con al menos 12 meses de antigüedad',
         'Acreditar la propiedad del inmueble',
         'Presupuesto de la obra a realizar',
         'Aval solidario e identificación oficial de ambos'],
   array['Ampliación', 'Reparación', 'Terminación de obra', 'Instalaciones'],
   'home', 'primary', false, 5)
on conflict (clave) do nothing;

-- =============================================================================
-- PRODUCTOS DE AHORRO
-- =============================================================================
insert into productos_ahorro (
  clave, nombre, descripcion, descripcion_larga, tasa_anual,
  monto_minimo_apertura, monto_minimo_saldo, plazo_dias,
  permite_retiro_anticipado, penalizacion_retiro_pct,
  aportacion_sugerida, periodicidad_aportacion, icono, color, destacado, orden
) values
  ('AHO-VISTA', 'Ahorro a la Vista',
   'Tu dinero disponible cuando lo necesites, sin plazo forzoso.',
   'La cuenta básica del socio. Deposita y retira en cualquier sucursal sin comisión y sin monto mínimo de permanencia.',
   2.0, 100, 100, null, true, 0, null, null, 'wallet', 'primary', true, 1),

  ('AHO-PROGRAMADO', 'Ahorro Programado',
   'Ponte una meta y llega a ella con aportaciones fijas.',
   'Defines una meta y un plazo, y la cooperativa te ayuda a sostener el hábito con aportaciones periódicas. Rinde más que el ahorro a la vista porque el saldo permanece.',
   6.5, 500, 500, 180, true, 2.0, 500, 'mensual', 'chart-bar', 'campo', true, 2),

  ('INV-PLAZO', 'Inversión a Plazo Fijo',
   'El mejor rendimiento para el dinero que no vas a necesitar pronto.',
   'Inversión a plazo con tasa garantizada desde la contratación. A mayor plazo, mayor rendimiento. Al vencimiento puedes renovar o retirar capital e intereses.',
   9.5, 5000, 5000, 365, false, 5.0, null, null, 'currency-dollar', 'oro', true, 3),

  ('AHO-INFANTIL', 'Ahorro Infantil Impulsaurio',
   'Enseña a ahorrar desde pequeños, con la mascota de la cooperativa.',
   'Cuenta a nombre de un menor administrada por su madre, padre o tutor socio. Incluye material de educación financiera y sin comisión por manejo de cuenta.',
   4.0, 50, 50, null, true, 0, 100, 'mensual', 'academic-cap', 'campo', false, 4)
on conflict (clave) do nothing;

-- =============================================================================
-- PREGUNTAS FRECUENTES
-- =============================================================================
insert into preguntas_frecuentes (categoria, pregunta, respuesta, orden, estado) values
  ('Hazte socio', '¿Qué necesito para hacerme socio de Impulsa?',
   'Necesitas ser mayor de edad, presentar tu identificación oficial vigente (INE), CURP, comprobante de domicilio no mayor a tres meses y cubrir la aportación al capital social. Puedes iniciar tu registro en línea y terminarlo en cualquiera de nuestras sucursales.',
   1, 'publicado'),
  ('Hazte socio', '¿Cuánto cuesta la aportación social?',
   'La aportación al capital social es de $500 y es tuya: forma parte de tu haber social y se te devuelve si algún día decides causar baja. No es una comisión ni un pago por el trámite.',
   2, 'publicado'),
  ('Hazte socio', '¿Puedo terminar mi registro en línea?',
   'Puedes capturar todos tus datos y subir tus documentos desde el portal. La validación final del expediente requiere una visita a sucursal para firmar tu solicitud de ingreso y verificar tus documentos originales.',
   3, 'publicado'),

  ('Créditos', '¿Cuánto tiempo tarda la respuesta a mi solicitud?',
   'Una vez que tu expediente está completo, el dictamen se emite en un plazo de 3 a 5 días hábiles. El Crédito Emergente se resuelve en 24 horas para socios activos sin atrasos.',
   1, 'publicado'),
  ('Créditos', '¿Necesito aval para pedir un crédito?',
   'Depende del producto y del monto. Los créditos personales hasta $30,000 no requieren aval. El Crédito Productivo, el Agrícola y el de Vivienda sí lo requieren, y el aval debe ser socio de la cooperativa.',
   2, 'publicado'),
  ('Créditos', '¿Qué pasa si me atraso en un pago?',
   'Tienes 3 días de gracia después de la fecha de vencimiento. A partir del cuarto día se genera interés moratorio sobre el capital vencido. Si prevés un atraso, acércate a tu sucursal antes de la fecha: siempre es mejor reestructurar que caer en mora.',
   3, 'publicado'),
  ('Créditos', '¿Puedo pagar mi crédito antes de tiempo?',
   'Sí, y te conviene. No cobramos penalización por pago anticipado. Como los intereses se calculan sobre saldos insolutos, cada pago adelantado reduce el interés que pagarás después.',
   4, 'publicado'),
  ('Créditos', '¿El simulador me garantiza el crédito?',
   'No. El simulador te muestra cómo quedarían tus pagos con las condiciones vigentes del producto, pero el monto y la tasa definitivos dependen del dictamen de tu solicitud y de tu capacidad de pago.',
   5, 'publicado'),

  ('Ahorro', '¿Mi ahorro genera rendimientos?',
   'Sí. El Ahorro a la Vista genera 2% anual, el Ahorro Programado 6.5% y la Inversión a Plazo Fijo hasta 9.5%. Las tasas las revisa y autoriza el Consejo de Administración.',
   1, 'publicado'),
  ('Ahorro', '¿Puedo retirar mi inversión antes del vencimiento?',
   'La Inversión a Plazo Fijo no admite retiro anticipado sin penalización: se aplica un 5% sobre los intereses generados. El Ahorro Programado sí permite retiro con una penalización menor del 2%.',
   2, 'publicado'),

  ('Portal', '¿Cómo consulto mi estado de cuenta?',
   'Entra al portal del socio con tu correo y contraseña. En la sección "Mis créditos" verás tu tabla de amortización completa, los pagos aplicados y la fecha de tu próxima cuota.',
   1, 'publicado'),
  ('Portal', 'Olvidé mi contraseña, ¿qué hago?',
   'En la pantalla de acceso da clic en "¿Olvidaste tu contraseña?" y escribe tu correo. Te enviaremos un enlace para crear una nueva. Si ya no tienes acceso a ese correo, acude a tu sucursal con tu identificación.',
   2, 'publicado')
on conflict do nothing;

-- =============================================================================
-- TESTIMONIOS
-- =============================================================================
insert into testimonios (nombre, cargo, texto, sucursal, calificacion, estado, orden) values
  ('María Elena Xocua', 'Socia desde 2019 · Productora de café',
   'Cuando necesité comprar la despulpadora, el banco me pidió cosas que yo no tenía. En Impulsa me explicaron el crédito en mi idioma, con la tabla de pagos en la mano. Ya lo liquidé y ahora estoy ahorrando para el siguiente ciclo.',
   'Matriz Zongolica', 5, 'publicado', 1),
  ('José Ramón Tepox', 'Socio desde 2021 · Comerciante',
   'Lo que más valoro es que sé exactamente cuánto debo y cuándo. Entro al portal desde el celular, veo mi próximo pago y ya. Nunca me han cobrado algo que no me hubieran dicho antes.',
   'Sucursal Orizaba', 5, 'publicado', 2),
  ('Guadalupe Ahuactzin', 'Socia desde 2018 · Maestra jubilada',
   'Empecé con el ahorro programado juntando poquito cada mes. Tres años después pude ayudar a mi hija con el enganche de su casa. La cooperativa me enseñó que ahorrar no es cuánto, es constancia.',
   'Matriz Zongolica', 5, 'publicado', 3),
  ('Fernando Cuahutle', 'Socio desde 2022 · Taller mecánico',
   'Pedí el crédito productivo para herramienta. Me tocó un mes malo y en lugar de cobrarme moratorios de inmediato, me llamaron para reestructurar. Eso no lo hace cualquiera.',
   'Sucursal Tezonapa', 4, 'publicado', 4)
on conflict do nothing;

-- =============================================================================
-- ENTRADAS DEL BLOG (educacion financiera)
-- =============================================================================
insert into entradas_blog (slug, titulo, resumen, contenido, categoria, etiquetas,
                           autor_nombre, estado, destacado, minutos_lectura, publicado_en)
values
  ('que-es-el-cat-y-por-que-importa',
   '¿Qué es el CAT y por qué deberías mirarlo antes que la tasa?',
   'La tasa de interés no te dice cuánto cuesta realmente un crédito. El CAT sí. Te explicamos cómo leerlo en tres minutos.',
   E'Cuando comparas dos créditos, lo primero que ves es la tasa de interés. El problema es que la tasa no incluye las comisiones, los seguros ni la forma en que se calculan los intereses.\n\n## El CAT sí incluye todo\n\nEl Costo Anual Total (CAT) es una medida estandarizada que la ley obliga a publicar. Incorpora la tasa de interés, la comisión por apertura, los seguros obligatorios y cualquier otro cargo. Por eso dos créditos con la misma tasa pueden tener CAT muy distintos.\n\n## Cómo usarlo\n\nCompara siempre CAT contra CAT, y siempre para el mismo monto y plazo. Un CAT más bajo significa que ese crédito te cuesta menos, punto.\n\n## Una advertencia\n\nEl CAT no considera si pagas antes de tiempo. Si liquidas anticipadamente un crédito con intereses sobre saldos insolutos, tu costo real baja por debajo del CAT publicado.',
   'Educación financiera', array['crédito', 'CAT', 'comparar'],
   'Equipo Impulsa', 'publicado', true, 3, now() - interval '5 days'),

  ('cinco-senales-de-que-un-credito-no-te-conviene',
   'Cinco señales de que ese crédito no te conviene',
   'Antes de firmar, revisa estas cinco cosas. Si aparece más de una, detente.',
   E'Pedir un crédito no es malo. Pedirlo en malas condiciones sí. Estas son las señales que en la cooperativa enseñamos a identificar.\n\n## 1. No te dan la tabla de amortización\n\nSi no te pueden mostrar cuánto pagas de capital y cuánto de interés en cada cuota, no sabes lo que estás firmando.\n\n## 2. El pago se lleva más de un tercio de tu ingreso\n\nComo regla práctica, la suma de todos tus pagos de deuda no debería pasar del 35% de lo que te queda después de tus gastos fijos.\n\n## 3. Te presionan para firmar hoy\n\nUna institución seria te da tiempo de leer. La urgencia es una técnica de venta, no un beneficio.\n\n## 4. Hay cargos que no te saben explicar\n\nCada peso de comisión debe tener nombre y motivo.\n\n## 5. Lo estás usando para pagar otra deuda sin un plan\n\nRefinanciar puede tener sentido, pero solo si baja tu costo total. Si solo estás moviendo la deuda de lugar, el problema crece.',
   'Educación financiera', array['crédito', 'endeudamiento', 'consejos'],
   'Equipo Impulsa', 'publicado', false, 4, now() - interval '12 days'),

  ('ahorro-programado-el-habito-que-si-funciona',
   'Ahorro programado: el hábito que sí funciona',
   'Ahorrar lo que sobra casi nunca funciona. Ahorrar primero, sí. Así lo hacemos en la cooperativa.',
   E'La mayoría de la gente ahorra lo que le sobra a fin de mes. El problema es que casi nunca sobra.\n\n## Págate primero\n\nEl ahorro programado invierte el orden: separas la aportación el día que recibes tu ingreso, no al final. Lo que queda es lo que gastas.\n\n## Empieza pequeño de verdad\n\nUna aportación de $200 quincenales que sí sostienes vale más que una de $1,000 que abandonas en dos meses.\n\n## Ponle nombre a la meta\n\nUn ahorro con destino ("el enganche", "la matrícula de mi hija") se abandona mucho menos que un ahorro genérico.\n\n## Que sea difícil sacarlo\n\nUna cuenta con plazo te protege de ti mismo en los momentos de tentación.',
   'Ahorro', array['ahorro', 'hábitos', 'metas'],
   'Equipo Impulsa', 'publicado', false, 3, now() - interval '20 days'),

  ('que-es-una-cooperativa-de-ahorro-y-credito',
   '¿Qué es una cooperativa de ahorro y crédito y en qué se diferencia de un banco?',
   'En un banco eres cliente. En una cooperativa eres dueño. Esa diferencia cambia todo lo demás.',
   E'La diferencia no es de tamaño ni de trato: es de estructura de propiedad.\n\n## En un banco eres cliente\n\nEl banco tiene accionistas. Las utilidades que genera tu operación van a ellos. Tu relación es comercial.\n\n## En una cooperativa eres socio\n\nAl hacer tu aportación te vuelves copropietario. Tienes voz y voto en la Asamblea General, sin importar cuánto hayas aportado: un socio, un voto.\n\n## Qué implica en la práctica\n\nLos excedentes se reinvierten en mejores tasas, más servicios o se distribuyen entre los socios. No hay un accionista externo esperando dividendos.\n\n## Y las obligaciones\n\nSer socio también implica participar: asistir a la asamblea, informarte y cuidar el patrimonio común, que también es tuyo.',
   'Cooperativismo', array['cooperativismo', 'educación', 'gobernanza'],
   'Equipo Impulsa', 'publicado', true, 4, now() - interval '30 days')
on conflict (slug) do nothing;

-- =============================================================================
-- AVISO DE BIENVENIDA
-- =============================================================================
insert into avisos (titulo, mensaje, tipo, enlace, texto_enlace, activo)
values (
  'Ya puedes solicitar tu crédito en línea',
  'Simula tu crédito, registra tu expediente y da seguimiento a tu solicitud desde el portal del socio.',
  'info', '/simulador', 'Ir al simulador', true
)
on conflict do nothing;
