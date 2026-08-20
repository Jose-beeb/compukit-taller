/**
 * Compukit - Backend Google Apps Script para Gestión de Taller de Reparación
 * Con soporte para subida de fotos a Google Drive, 3 pestañas (Órdenes, Flujo_Caja, Configuracion_Taller),
 * mapeo dinámico de columnas, actualización bidireccional y manejo de peticiones CORS/Redirects.
 * 
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. En tu Hoja de Cálculo de Google Sheets, ve a: Extensiones -> Apps Script.
 * 2. Pega este archivo completo borrando lo que haya.
 * 3. Haz clic en "Guardar" (💾).
 * 4. Haz clic en "Implementar" -> "Nueva implementación" (o "Administrar implementaciones" -> "Editar" -> "Nueva versión").
 *    - Tipo: "Aplicación web"
 *    - Ejecutar como: "Yo"
 *    - Quién tiene acceso: "Cualquier persona" (Anyone)
 * 5. Copia la URL de la aplicación web (terminada en /exec) y pégala en la pestaña Config de la app.
 */

const SHEET_ORDERS = "Órdenes";
const SHEET_CASHFLOW = "Flujo_Caja";
const SHEET_CONFIG = "Configuracion_Taller";
const FOLDER_NAME = "Compukit_Fotos_Taller";

const HEADERS_ORDERS = [
  "ID_Orden",
  "Fecha_Ingreso",
  "Cliente",
  "Telefono",
  "Tipo_Equipo",
  "Marca_Modelo",
  "Accesorios",
  "Falla_Reportada",
  "Fotos_Drive_URL",
  "Estado",
  "Trabajo_Realizado",
  "Tecnico_Responsable",
  "Costo_Total",
  "Abono",
  "Saldo_Pendiente",
  "Fecha_Entrega",
  "Ultima_Actualizacion"
];

const HEADERS_CASHFLOW = [
  "Fecha",
  "ID_Orden",
  "Concepto",
  "Tipo", // Ingreso / Gasto
  "Monto",
  "Metodo_Pago" // Efectivo / Transferencia
];

const HEADERS_CONFIG = [
  "Clave",
  "Valor_JSON",
  "Ultima_Actualizacion"
];

// Obtener Spreadsheet activa o buscar por ID configurado
function getSpreadsheet() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (propId) {
      ss = SpreadsheetApp.openById(propId);
    }
  }
  if (!ss) {
    throw new Error("No se pudo acceder a la Hoja de Cálculo. Asegúrate de abrir Apps Script desde tu Google Sheet (Extensiones > Apps Script).");
  }
  return ss;
}

// Obtener o crear carpeta en Google Drive para almacenar fotos
function getOrCreatePhotosFolder() {
  try {
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    }
    const newFolder = DriveApp.createFolder(FOLDER_NAME);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return newFolder;
  } catch (err) {
    Logger.log("Aviso al acceder a Drive: " + err.toString());
    return null;
  }
}

// Inicializar o verificar las hojas y sus encabezados
function initSheets() {
  const ss = getSpreadsheet();
  
  // 1. Hoja de Órdenes
  let sheetOrders = ss.getSheetByName(SHEET_ORDERS);
  if (!sheetOrders) {
    sheetOrders = ss.insertSheet(SHEET_ORDERS);
    sheetOrders.getRange(1, 1, 1, HEADERS_ORDERS.length).setValues([HEADERS_ORDERS]);
    sheetOrders.getRange(1, 1, 1, HEADERS_ORDERS.length).setFontWeight("bold").setBackground("#1a365d").setFontColor("#ffffff");
    sheetOrders.setFrozenRows(1);
  } else {
    // Si la hoja ya existía, asegurar que tenga todas las columnas requeridas (ej: Tecnico_Responsable)
    const existingCols = sheetOrders.getLastColumn();
    if (existingCols < HEADERS_ORDERS.length) {
      sheetOrders.getRange(1, 1, 1, HEADERS_ORDERS.length).setValues([HEADERS_ORDERS]);
      sheetOrders.getRange(1, 1, 1, HEADERS_ORDERS.length).setFontWeight("bold").setBackground("#1a365d").setFontColor("#ffffff");
      sheetOrders.setFrozenRows(1);
    }
  }

  // 2. Hoja de Flujo de Caja
  let sheetCash = ss.getSheetByName(SHEET_CASHFLOW);
  if (!sheetCash) {
    sheetCash = ss.insertSheet(SHEET_CASHFLOW);
    sheetCash.getRange(1, 1, 1, HEADERS_CASHFLOW.length).setValues([HEADERS_CASHFLOW]);
    sheetCash.getRange(1, 1, 1, HEADERS_CASHFLOW.length).setFontWeight("bold").setBackground("#065f46").setFontColor("#ffffff");
    sheetCash.setFrozenRows(1);
  }

  // 3. Hoja de Configuración
  let sheetConfig = ss.getSheetByName(SHEET_CONFIG);
  if (!sheetConfig) {
    sheetConfig = ss.insertSheet(SHEET_CONFIG);
    sheetConfig.getRange(1, 1, 1, HEADERS_CONFIG.length).setValues([HEADERS_CONFIG]);
    sheetConfig.getRange(1, 1, 1, HEADERS_CONFIG.length).setFontWeight("bold").setBackground("#374151").setFontColor("#ffffff");
    sheetConfig.setFrozenRows(1);
    sheetConfig.appendRow(["tecnicos", JSON.stringify(["Principal", "Técnico 1"]), new Date()]);
  }

  return { sheetOrders, sheetCash, sheetConfig };
}

// Manejar lectura (GET)
function doGet(e) {
  try {
    const { sheetOrders, sheetCash, sheetConfig } = initSheets();
    const action = (e && e.parameter && e.parameter.action) || "read";

    if (action === "test") {
      return responseJSON({
        status: "success",
        message: "Conexión exitosa con Google Sheets & Drive (Compukit Backend Activo)"
      });
    }

    // Leer Órdenes
    const dataOrders = sheetOrders.getDataRange().getValues();
    const orders = [];
    if (dataOrders.length > 1) {
      const headers = dataOrders[0];
      for (let i = 1; i < dataOrders.length; i++) {
        const row = dataOrders[i];
        if (!row[0]) continue;
        const record = {};
        headers.forEach((h, idx) => {
          let val = row[idx];
          if (val instanceof Date) {
            val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
          }
          if (h === "Costo_Total" || h === "Abono" || h === "Saldo_Pendiente") {
            val = parseFloat(val) || 0;
          }
          record[h] = val !== undefined ? val : "";
        });
        orders.push(record);
      }
    }

    // Leer Flujo de Caja
    const dataCash = sheetCash.getDataRange().getValues();
    const cashFlow = [];
    if (dataCash.length > 1) {
      const headersCash = dataCash[0];
      for (let i = 1; i < dataCash.length; i++) {
        const row = dataCash[i];
        if (!row[0]) continue;
        const item = {};
        headersCash.forEach((h, idx) => {
          let val = row[idx];
          if (val instanceof Date) {
            val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
          }
          if (h === "Monto") {
            val = parseFloat(val) || 0;
          }
          item[h] = val !== undefined ? val : "";
        });
        cashFlow.push(item);
      }
    }

    // Leer Configuración (Técnicos sincronizados)
    let technicians = ["Principal"];
    const dataCfg = sheetConfig.getDataRange().getValues();
    if (dataCfg.length > 1) {
      for (let i = 1; i < dataCfg.length; i++) {
        if (dataCfg[i][0] === "tecnicos") {
          try {
            technicians = JSON.parse(dataCfg[i][1]);
          } catch(err) {}
          break;
        }
      }
    }

    return responseJSON({
      status: "success",
      orders: orders,
      cashFlow: cashFlow,
      technicians: technicians
    });

  } catch (error) {
    return responseJSON({ status: "error", message: error.toString() });
  }
}

// Guardar foto Base64 en Google Drive y retornar link público
function saveBase64ImageToDrive(base64Data, filename) {
  try {
    if (!base64Data || typeof base64Data !== "string" || !base64Data.includes("base64,")) {
      return "";
    }
    const folder = getOrCreatePhotosFolder();
    if (!folder) return "";

    const splitData = base64Data.split("base64,");
    const contentType = splitData[0].split(":")[1].split(";")[0];
    const bytes = Utilities.base64Decode(splitData[1]);
    const blob = Utilities.newBlob(bytes, contentType, filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log("Error al guardar foto: " + err.toString());
    return "";
  }
}

// Manejar escritura y actualizaciones (POST)
function doPost(e) {
  try {
    let payload;
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        payload = e.parameter;
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    } else {
      return responseJSON({ status: "error", message: "Sin datos recibidos en la petición POST" });
    }

    if (!payload) {
      return responseJSON({ status: "error", message: "El cuerpo de la petición está vacío" });
    }

    const { sheetOrders, sheetCash, sheetConfig } = initSheets();
    const action = payload.action || "create";
    const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

    // 1. CREAR NUEVO INGRESO
    if (action === "create") {
      const orderId = payload.ID_Orden || ("CK-" + Math.floor(100000 + Math.random() * 900000));
      
      // Guardar imagen en Drive si viene en base64
      let photoUrl = "";
      if (payload.Foto_Base64) {
        photoUrl = saveBase64ImageToDrive(payload.Foto_Base64, "Foto_" + orderId + ".jpg");
      }

      const total = parseFloat(payload.Costo_Total) || 0;
      const abono = parseFloat(payload.Abono) || 0;
      const saldo = Math.max(0, total - abono);

      // Obtener encabezados actuales para mapeo dinámico exacto
      const headers = sheetOrders.getRange(1, 1, 1, Math.max(sheetOrders.getLastColumn(), HEADERS_ORDERS.length)).getValues()[0];
      const newOrderRow = headers.map(h => {
        switch (h) {
          case "ID_Orden": return orderId;
          case "Fecha_Ingreso": return payload.Fecha_Ingreso || nowStr;
          case "Cliente": return payload.Cliente || "";
          case "Telefono": return payload.Telefono || "";
          case "Tipo_Equipo": return payload.Tipo_Equipo || "Computadora";
          case "Marca_Modelo": return payload.Marca_Modelo || "";
          case "Accesorios": return payload.Accesorios || "Ninguno";
          case "Falla_Reportada": return payload.Falla_Reportada || "";
          case "Fotos_Drive_URL": return photoUrl;
          case "Estado": return payload.Estado || "Recibido";
          case "Trabajo_Realizado": return payload.Trabajo_Realizado || "";
          case "Tecnico_Responsable": return payload.Tecnico_Responsable || "Principal";
          case "Costo_Total": return total;
          case "Abono": return abono;
          case "Saldo_Pendiente": return saldo;
          case "Fecha_Entrega": return payload.Fecha_Entrega || "";
          case "Ultima_Actualizacion": return nowStr;
          default: return payload[h] !== undefined ? payload[h] : "";
        }
      });

      sheetOrders.appendRow(newOrderRow);

      // Si hubo un abono inicial > 0, registrar en Flujo_Caja
      if (abono > 0) {
        const cashRow = [
          nowStr,
          orderId,
          "Abono inicial (" + (payload.Cliente || "") + ")",
          "Ingreso",
          abono,
          payload.Metodo_Pago || "Efectivo"
        ];
        sheetCash.appendRow(cashRow);
      }

      return responseJSON({
        status: "success",
        action: "create",
        orderId: orderId,
        photoUrl: photoUrl
      });
    }

    // 2. ACTUALIZAR ESTADO / DETALLES DE UNA ORDEN
    if (action === "update_status" || action === "update") {
      const orderId = payload.ID_Orden;
      if (!orderId) {
        return responseJSON({ status: "error", message: "ID_Orden requerido para actualizar" });
      }

      const data = sheetOrders.getDataRange().getValues();
      let rowIndex = -1;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === String(orderId).trim().toLowerCase()) {
          rowIndex = i + 1; // Fila en Sheets (1-based index)
          break;
        }
      }

      if (rowIndex === -1) {
        return responseJSON({ status: "error", message: "Orden no encontrada en Google Sheets: " + orderId });
      }

      const headers = data[0];
      
      if (payload.Estado) {
        const col = headers.indexOf("Estado");
        if (col !== -1) sheetOrders.getRange(rowIndex, col + 1).setValue(payload.Estado);
      }
      if (payload.Falla_Reportada !== undefined) {
        const col = headers.indexOf("Falla_Reportada");
        if (col !== -1) sheetOrders.getRange(rowIndex, col + 1).setValue(payload.Falla_Reportada);
      }
      if (payload.Trabajo_Realizado !== undefined) {
        const col = headers.indexOf("Trabajo_Realizado");
        if (col !== -1) sheetOrders.getRange(rowIndex, col + 1).setValue(payload.Trabajo_Realizado);
      }
      if (payload.Tecnico_Responsable) {
        const col = headers.indexOf("Tecnico_Responsable");
        if (col !== -1) sheetOrders.getRange(rowIndex, col + 1).setValue(payload.Tecnico_Responsable);
      }

      const costCol = headers.indexOf("Costo_Total");
      const abonoCol = headers.indexOf("Abono");
      let currentTotal = costCol !== -1 ? (parseFloat(data[rowIndex - 1][costCol]) || 0) : 0;
      let currentAbono = abonoCol !== -1 ? (parseFloat(data[rowIndex - 1][abonoCol]) || 0) : 0;

      if (payload.Costo_Total !== undefined) {
        currentTotal = parseFloat(payload.Costo_Total) || 0;
        if (costCol !== -1) sheetOrders.getRange(rowIndex, costCol + 1).setValue(currentTotal);
      }

      if (payload.Abono !== undefined) {
        currentAbono = parseFloat(payload.Abono) || 0;
        if (abonoCol !== -1) sheetOrders.getRange(rowIndex, abonoCol + 1).setValue(currentAbono);
      }

      // Recalcular Saldo_Pendiente automáticamente
      const saldoCol = headers.indexOf("Saldo_Pendiente");
      if (saldoCol !== -1) {
        sheetOrders.getRange(rowIndex, saldoCol + 1).setValue(Math.max(0, currentTotal - currentAbono));
      }

      if (payload.Estado === "Entregado") {
        const col = headers.indexOf("Fecha_Entrega");
        const deliveryDate = payload.Fecha_Entrega || nowStr;
        if (col !== -1) sheetOrders.getRange(rowIndex, col + 1).setValue(deliveryDate);

        // Si se cobró saldo al entregar
        const paymentAmount = parseFloat(payload.Cobro_Final) || 0;
        if (paymentAmount > 0) {
          const cashRow = [
            nowStr,
            orderId,
            "Cobro final entrega (" + (payload.Cliente || orderId) + ")",
            "Ingreso",
            paymentAmount,
            payload.Metodo_Pago || "Efectivo"
          ];
          sheetCash.appendRow(cashRow);
        }
      }

      // Actualizar timestamp
      const updateCol = headers.indexOf("Ultima_Actualizacion");
      if (updateCol !== -1) {
        sheetOrders.getRange(rowIndex, updateCol + 1).setValue(nowStr);
      }

      return responseJSON({
        status: "success",
        action: "update",
        orderId: orderId
      });
    }

    // 3. SINCRONIZAR TÉCNICOS EN TODOS LOS DISPOSITIVOS
    if (action === "update_technicians") {
      const list = payload.technicians || ["Principal"];
      const dataCfg = sheetConfig.getDataRange().getValues();
      let rowFound = -1;
      for (let i = 1; i < dataCfg.length; i++) {
        if (dataCfg[i][0] === "tecnicos") {
          rowFound = i + 1;
          break;
        }
      }
      if (rowFound !== -1) {
        sheetConfig.getRange(rowFound, 2).setValue(JSON.stringify(list));
        sheetConfig.getRange(rowFound, 3).setValue(nowStr);
      } else {
        sheetConfig.appendRow(["tecnicos", JSON.stringify(list), nowStr]);
      }
      return responseJSON({ status: "success", technicians: list });
    }

    return responseJSON({ status: "error", message: "Acción no reconocida: " + action });

  } catch (error) {
    return responseJSON({ status: "error", message: error.toString() });
  }
}

function responseJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

