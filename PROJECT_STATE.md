# Estado del Proyecto: Compukit Taller

Este archivo centraliza el estado, arquitectura y esquema de datos del proyecto para optimizar el uso de tokens y sincronización de sesiones.

---

## 🛠️ Stack Tecnológico
- **Frontend**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS3 (Variables CSS, Flexbox, CSS Grid).
- **Arquitectura**: PWA (Progressive Web App - `manifest.json` + `sw.js`).
- **Backend / Sincronización**: Google Apps Script (`Code.gs`) integrado con Google Sheets & Google Drive (vía `doGet` / `doPost` con `redirect: "follow"` y `text/plain`).
- **Almacenamiento de Fotos**: Compresión en cliente Canvas (1024px máx, JPEG 0.7) ➔ Google Drive (Carpeta `Compukit_Fotos_Taller`) ➔ Enlace público en Google Sheets.
- **Cola Offline Resiliente**: Guardado inmediato en `localStorage` con estado `_sync_status: "Pendiente"` y reintentos automáticos en segundo plano / evento `online`.
- **APIs Web Integradas**:
  - Web Speech API (`SpeechRecognition`) para dictado por voz de fallas y diagnósticos.
  - Web Camera Input (`capture="environment"`) para fotos de equipos.
  - CDN jsPDF v2.5.1 para generación de comprobantes en PDF.
  - WhatsApp Deep Links (`https://wa.me/`) para notificaciones directas al cliente.

---

## 📁 Estructura del Proyecto

```
Compukit/
├── index.html                   # Interfaz de usuario (Wizard de 4 pasos, tarjetas, modales)
├── style.css                    # Estilos accesibles (+50 años), variables CSS, tema claro/oscuro
├── app.js                       # Lógica de la app, cola offline, compresión fotos, WhatsApp y PDF
├── manifest.json                # PWA manifest para instalación en pantalla de inicio móvil
├── sw.js                        # Service Worker para caché fuera de línea
├── PROJECT_STATE.md             # Estado centralizado del proyecto (este archivo)
└── google-apps-script/
    └── Code.gs                  # Backend en Google Apps Script (Drive + Sheets dual)
```

---

## 📊 Esquema de Datos en Google Sheets

### Pestaña 1: `Órdenes`
| Columna N° | Nombre Exacto de Columna | Tipo | Descripción |
|---|---|---|---|
| 1 | `ID_Orden` | Texto | Identificador único (`CK-123456`) |
| 2 | `Fecha_Ingreso` | Texto/Fecha | Fecha y hora de recepción |
| 3 | `Cliente` | Texto | Nombre y apellido del cliente |
| 4 | `Telefono` | Texto | Celular / WhatsApp |
| 5 | `Tipo_Equipo` | Texto | Laptop, PC, Impresora, Monitor, Otro |
| 6 | `Marca_Modelo` | Texto | Marca y modelo del equipo |
| 7 | `Accesorios` | Texto | Cargador, Funda, Mouse, etc. |
| 8 | `Falla_Reportada` | Texto | Diagnóstico / Falla reportada |
| 9 | `Fotos_Drive_URL` | Texto | Enlace público a la foto en Google Drive |
| 10 | `Estado` | Texto | `Recibido`, `En Diagnóstico`, `Esperando Aprobación`, `En Reparación`, `Listo`, `Entregado` |
| 11 | `Trabajo_Realizado` | Texto | Detalle de reparación / repuestos |
| 12 | `Riesgo_Inaccion` | Texto | Advertencia técnica y costo por agravamiento si se posterga la reparación |
| 13 | `Costo_Total` | Número | Valor total del trabajo |
| 14 | `Abono` | Número | Abono inicial entregado |
| 15 | `Saldo_Pendiente` | Número | `Costo_Total - Abono` |
| 16 | `Fecha_Entrega` | Texto/Fecha | Fecha de entrega al cliente |
| 17 | `Ultima_Actualizacion` | Texto/Fecha | Timestamp de última edición |

### Pestaña 2: `Flujo_Caja`
| Columna N° | Nombre Exacto de Columna | Tipo | Descripción |
|---|---|---|---|
| 1 | `Fecha` | Texto/Fecha | Fecha del movimiento |
| 2 | `ID_Orden` | Texto | Orden asociada |
| 3 | `Concepto` | Texto | Descripción del cobro/abono |
| 4 | `Tipo` | Texto | `Ingreso` o `Gasto` |
| 5 | `Monto` | Número | Valor monetario |
| 6 | `Metodo_Pago` | Texto | `Efectivo` o `Transferencia` |

### Pestaña 3: `Configuracion_Taller`
| Columna N° | Nombre Exacto de Columna | Tipo | Descripción |
|---|---|---|---|
| 1 | `Clave` | Texto | Identificador del ajuste (ej: `tecnicos`) |
| 2 | `Valor_JSON` | Texto/JSON | Valor serializado en JSON (ej: `["Principal", "Carlos"]`) |
| 3 | `Ultima_Actualizacion` | Texto/Fecha | Timestamp de última modificación |

---

## ♿ Convenciones de Accesibilidad y Código (+50 Años)
1. **Áreas de Toque Táctil**: Altura mínima `>= 56px`.
2. **Tipografía y Contraste**: Tamaño base `>= 18px`, WCAG AAA.
3. **Modo Claro / Oscuro**: Control dinámico mediante `data-theme="light|dark"`.
4. **Optimización de Edición**: Modificaciones quirúrgicas localizadas.

---

## 🚦 Estado Actual de las Tareas
- [x] Backend `Code.gs` actualizado con subida a Drive, 3 pestañas (`Órdenes`, `Flujo_Caja`, `Configuracion_Taller`), soporte para `Riesgo_Inaccion` y `doPost` bidireccional.
- [x] Frontend `app.js` actualizado con compresión Canvas (1024px JPEG 0.7), `redirect: "follow"` + `text/plain`, cola offline resiliente y gestión de técnicos sincronizados.
- [x] Motor de Base de Conocimiento Inteligente (`DiagnosticAdvisor`) offline con sugerencias automáticas de riesgos de inacción y costos por agravamiento con 1 solo clic.
- [x] Generador de Informe Técnico y Presupuesto formal en PDF (A4) con cuadro comparativo de inversión vs. riesgo por inacción y firmas.
- [x] Mensajería persuasiva de WhatsApp con cotizaciones completas incluyendo advertencias técnicas y costos por postergación.
- [x] Corrección y optimización del buscador de taller (soporte para acentos, búsqueda por múltiples palabras, tipos de datos seguros y compatibilidad total con teclados virtuales móviles).
- [x] Flujo de avance rápido de estados en 1 toque en tarjetas de taller y semáforo de alertas urgentes por tiempo estancado (12h, 24h y 48h).
- [x] Modal de éxito post-ingreso con envío instantáneo de Comprobante Digital por WhatsApp y descarga dual de PDF (Copia Cliente vs. Ticket Doble).
