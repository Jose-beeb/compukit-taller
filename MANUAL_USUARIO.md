# 📖 MANUAL DE USUARIO Y GUÍA DE CONFIGURACIÓN - COMPUKIT TALLER
**Sistema Web y Móvil de Gestión de Reparaciones y Servicios**
*Diseñado especialmente para técnicos y administradores de talleres (Accesible, Botones Grandes, Dictado por Voz y WhatsApp).*

---

## 1. 📌 ¿QUÉ ES COMPUKIT TALLER?
**Compukit** es una Aplicación Web Progresiva (PWA) ligera, moderna y fácil de usar en computadoras y teléfonos inteligentes (Android / iPhone). 

### ✨ Características Principales:
- 📱 **Funciona en el Celular como una App Nativa** (sin necesidad de Play Store).
- ☁️ **Sincronización en la Nube con Google Sheets y Google Drive** (tus clientes y dinero están 100% seguros y privados en tu cuenta).
- ⚡ **Modo Offline:** Puedes seguir recibiendo equipos aunque se corte el internet en el local; los datos se enviarán a Google Sheets automáticamente al volver la conexión.
- 🎙️ **Dictado por Voz:** No necesitas escribir diagnósticos largos; solo presionas el micrófono y hablas.
- 💬 **Mensajes Automáticos de WhatsApp:** Envía cotizaciones con fallas, soluciones y costos exactos al cliente con 1 solo clic.
- 👨‍🔧 **Registro por Técnico:** Identifica quién recibió cada equipo y quién realizó el trabajo.

---

## 2. ⚙️ GUÍA DE CONFIGURACIÓN INICIAL (PASO A PASO)

### PASO 1: Configurar Google Sheets y Google Apps Script
1. Abre tu navegador y entra a tu cuenta de **Google Drive** ([drive.google.com](https://drive.google.com)).
2. Crea una **Nueva Hoja de Cálculo de Google** y nómbrala: `Compukit_BaseDatos`.
3. En el menú superior de la hoja, haz clic en **Extensiones ➔ Apps Script**.
4. Borra todo el código que aparezca en el editor y pega todo el contenido del archivo `google-apps-script/Code.gs`.
5. Haz clic en el botón **Guardar** 💾 (ícono de disquete).
6. Haz clic en el botón azul **Implementar ➔ Nueva implementación**.
7. En el tipo de implementación selecciona **Aplicación web** (ícono de engranaje).
8. Configura los siguientes campos:
   - **Descripción:** `Compukit Backend v1`
   - **Ejecutar como:** `Yo (tu correo de Gmail)`
   - **Quién tiene acceso:** `Cualquier persona` *(Esto permite que tus celulares envíen datos a tu hoja).*
9. Haz clic en **Implementar**.
10. Google te pedirá permisos:
    - Haz clic en **Revisar permisos** ➔ Selecciona tu correo ➔ Haz clic en **Avanzado** ➔ Haz clic en **Ir a Proyecto (no seguro)** ➔ Haz clic en **Permitir**.
11. Copia la **URL de la aplicación web** generada (termina en `/exec`).

---

### PASO 2: Conectar la App en tu Teléfono / Computadora
1. Abre tu enlace de Compukit en el navegador:
   $$\text{https://jose-beeb.github.io/compukit-taller/}$$
2. Ve a la pestaña **⚙️ Config** en la barra inferior.
3. En el campo **URL de la Web App (Google Apps Script)**, pega la URL que copiaste en el Paso 1.
4. Haz clic en **"💾 Guardar y Probar Conexión"**.
5. Verás el mensaje verde: `✅ Conexión Exitosa. Sincronizado con Google Sheets & Drive.`
6. *(Opcional)* En la sección **👨‍🔧 Técnicos y Personal del Taller**, agrega los nombres del personal (ej: *Nancy*, *Carlos*, *Luis*).

---

### PASO 3: Instalar en la Pantalla del Celular
- **En Android (Chrome):** Toca los 3 puntos superiores derechos ➔ **"Agregar a la pantalla principal"** o **"Instalar aplicación"**.
- **En iPhone (Safari):** Toca el botón central de compartir (cuadrado con flecha hacia arriba) ➔ **"Agregar al inicio"**.

---

## 3. 🚀 FUNCIONAMIENTO DIARIO DEL TALLER

### ➕ 1. Registrar un Nuevo Equipo (Paso a Paso)
1. **Paso 1 - Cliente:** Ingresa el **Nombre** y el **Teléfono Celular** (ej: `0991234567`).
2. **Paso 2 - Equipo y Accesorios:**
   - Selecciona el tipo de equipo (*Laptop*, *PC*, *Impresora*, *Planos*, etc.).
   - Escribe la marca y modelo (ej: *HP Pavilion 15*).
   - Toca los accesorios que deja el cliente (*🔌 Cargador*, *⚡ Cable Poder*, *🎒 Funda*, *📦 Otro*).
3. **Paso 3 - Diagnóstico y Foto:**
   - Escribe el problema reportado o presiona el botón **🎙️ Dictar por Voz** para hablarle al teléfono.
   - *(Opcional)* Toma una foto del estado físico del equipo (se guardará en tu Google Drive).
4. **Paso 4 - Costo:**
   - Si no sabes el costo aún, déjalo en `$0.00`.
   - Si el cliente deja un abono, anótalo en **Abono Inicial ($)**.
   - Haz clic en **✅ GUARDAR EQUIPO**.

---

### 🛠️ 2. Diagnóstico y Envío de Cotización por WhatsApp
Cuando el equipo ya fue revisado en el taller:
1. Ve a la pestaña **🛠️ Taller**.
2. Busca la tarjeta del equipo (puedes usar el buscador 🔍 por nombre o marca).
3. Haz clic en **📝 Diagnóstico / Estado**.
4. Cambia el estado a **`🟣 Diagnóstico Listo (Esperando Aprobación)`**.
5. Escribe la falla confirmada y la solución técnica (o usa el botón de dictado).
6. Ingresa el **Costo Total ($)** y presiona **💾 Guardar Cambios**.
7. En la tarjeta del equipo, presiona **💬 WhatsApp**:
   - Se abrirá WhatsApp con un mensaje pre-redactado listo para enviar:
   > *"Hola Nancy, le saludamos de COMPUKIT. Hemos finalizado la revisión de su Impresora: Falla: Placa dañada. Solución: Cambio de placa. Costo Estimado: $30.00. ¿Desea que procedamos?"*

---

### 📦 3. Entrega de Equipos y Liquidación de Pagos
Cuando el cliente viene a retirar el equipo:
1. En la pestaña **🛠️ Taller**, presiona **📝 Diagnóstico / Estado**.
2. Cambia el estado a **`⚪ Entregado al Cliente`**.
3. Se desplegará la sección **📦 Cobro y Liquidación de Entrega**:
   - **✅ Todo Cobrado:** Cancela el 100% de la deuda (Saldo restante: $0.00).
   - **⚠️ Cobro Parcial:** Si el cliente deja una parte hoy, ingresa el monto pagado y el sistema mantendrá el saldo restante pendiente.
   - **⏳ Sin Cobro (A crédito):** El equipo se entrega pero el saldo completo queda pendiente de pago.
4. Presiona **💾 Guardar Cambios**.

---

### 📄 4. Comprobantes y Tickets
- En la tarjeta del equipo, haz clic en **📄 Ticket PDF** para abrir la vista previa del comprobante.
- Pulsa **📥 Descargar Comprobante en PDF** para guardar el archivo en tu dispositivo; una vez descargado, podrás abrirlo e imprimirlo con cualquier visor de PDF o impresora.

---

## 4. ❓ RESOLUCIÓN DE PROBLEMAS FRECUENTES (FAQ)

| Problema | Causa Común | Solución Inmediata |
|---|---|---|
| **El botón de WhatsApp no abre la app.** | El teléfono del cliente está mal escrito. | Asegúrate de escribir el número con 10 dígitos (ej: `0998765432`). El sistema le añadirá el código internacional `593` automáticamente. |
| **Aparece "Sin URL Sheets" en amarillo arriba.** | No se ha guardado la URL de Apps Script en este dispositivo. | Ve a **⚙️ Config**, pega tu URL de Google Apps Script y presiona **💾 Guardar y Probar Conexión**. |
| **No se escuchan mis palabras con el micrófono.** | Permisos de micrófono desactivados en el navegador. | Haz clic en el ícono de candado junto a la dirección web en tu celular y asegúrate de dar permiso de **Micrófono** a la página. |
| **Quiero borrar registros de prueba.** | Datos residuales en Sheets y memoria local. | Borra las filas en tu hoja de Google Sheets (desde la fila 2) y luego ve a **⚙️ Config** en la app y pulsa **"💾 Guardar y Probar Conexión"** para refrescar la lista. |
| **Los cambios de técnicos no se ven en otro celular.** | Falta actualizar el script `Code.gs` en Google. | En Google Apps Script, pega el último `Code.gs`, ve a **Implementar ➔ Administrar implementaciones ➔ Editar (lápiz) ➔ Nueva versión ➔ Implementar**. |
