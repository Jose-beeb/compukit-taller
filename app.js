/**
 * Compukit - Lógica de la Aplicación Móvil
 * Integración con Google Apps Script (Drive + Sheets), Cola Offline resiliente,
 * Compresión de fotos en Canvas (máx 1024px, JPEG 0.7), Dictado por Voz y WhatsApp.
 */

class CompukitApp {
  constructor() {
    this.currentStep = 1;
    this.sheetsUrl = localStorage.getItem("compukit_sheets_url") || "";
    this.orders = JSON.parse(localStorage.getItem("compukit_orders") || "[]");
    this.cashFlow = JSON.parse(localStorage.getItem("compukit_cashflow") || "[]");
    this.syncQueue = JSON.parse(localStorage.getItem("compukit_sync_queue") || "[]");

    const defaultServices = [
      "💻 Laptop / Portátil",
      "🖥️ PC de Escritorio",
      "🖨️ Impresora",
      "📐 Impresión de Planos",
      "🖥️ Monitor / Pantalla",
      "🔌 Otro Servicio / Dispositivo"
    ];
    this.services = JSON.parse(localStorage.getItem("compukit_services") || JSON.stringify(defaultServices));
    const defaultTechnicians = ["Principal", "Técnico 1"];
    this.technicians = JSON.parse(localStorage.getItem("compukit_technicians") || JSON.stringify(defaultTechnicians));
    this.activeTechnician = localStorage.getItem("compukit_active_tech") || this.technicians[0];

    this.selectedPhotoBase64 = "";
    this.activeFilter = "TODOS";
    this.speechRecognition = null;
    this.isRecording = false;

    this.init();
  }

  init() {
    this.setupTheme();
    this.setupNavigation();
    this.renderTechnicianSelector();
    this.renderTechniciansManager();
    this.renderServiceChips();
    this.renderCustomServicesManager();
    this.setupChipHandlers();
    this.setupVoiceDictation();
    this.setupSearchHandler();
    this.updateSyncBadge();

    // Cargar URL configurada si existe
    if (this.sheetsUrl) {
      const urlInput = document.getElementById("sheets-url-input");
      if (urlInput) urlInput.value = this.sheetsUrl;
      this.fetchFromSheets();
    } else {
      this.renderEquipmentList();
      this.renderStats();
    }

    // Procesar cola offline en segundo plano
    this.processSyncQueue();
    window.addEventListener("online", () => this.processSyncQueue());

    // Registrar Service Worker para PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn("Service worker no registrado:", err);
      });
    }
  }

  renderTechnicianSelector() {
    const optionsHtml = this.technicians.map(tech => `
      <option value="${this.escapeHTML(tech)}" ${tech === this.activeTechnician ? 'selected' : ''}>
        ${this.escapeHTML(tech)}
      </option>
    `).join("");

    // 1. Selector en la barra superior
    const headerSelect = document.getElementById("active-technician-select");
    if (headerSelect) headerSelect.innerHTML = optionsHtml;

    // 2. Selector en el formulario de nuevo ingreso (Paso 1)
    const recordSelect = document.getElementById("record-technician-select");
    if (recordSelect) recordSelect.innerHTML = optionsHtml;

    // 3. Selector en el modal de actualización
    const updateSelect = document.getElementById("update-technician-select");
    if (updateSelect) updateSelect.innerHTML = optionsHtml;

    // 4. Selector de filtro en el listado de taller
    const filterSelect = document.getElementById("filter-technician-select");
    if (filterSelect) {
      const currentVal = filterSelect.value || "TODOS";
      filterSelect.innerHTML = `
        <option value="TODOS" ${currentVal === 'TODOS' ? 'selected' : ''}>👨‍🔧 Todos los Técnicos</option>
        ${this.technicians.map(tech => `
          <option value="${this.escapeHTML(tech)}" ${currentVal === tech ? 'selected' : ''}>
            👤 ${this.escapeHTML(tech)}
          </option>
        `).join("")}
      `;
    }
  }

  changeActiveTechnician(techName) {
    this.activeTechnician = techName;
    localStorage.setItem("compukit_active_tech", techName);
    const recordSelect = document.getElementById("record-technician-select");
    if (recordSelect) recordSelect.value = techName;
  }

  renderTechniciansManager() {
    const container = document.getElementById("technicians-list");
    if (!container) return;

    container.innerHTML = this.technicians.map((tech, index) => `
      <div style="display: inline-flex; align-items: center; gap: 6px; background-color: var(--bg-secondary); border: 2px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 12px; font-weight: bold; font-size: 0.95rem;">
        <span>👤 ${this.escapeHTML(tech)}</span>
        <button type="button" onclick="window.app && window.app.deleteTechnician(${index})" style="background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--danger); margin-left: 4px;" title="Eliminar técnico">❌</button>
      </div>
    `).join("");
  }

  addTechnician() {
    const input = document.getElementById("new-technician-input");
    if (!input) return;
    const val = input.value.trim();
    if (!val) {
      this.showToast("⚠️ Por favor escribe el nombre del técnico.", "warning");
      return;
    }

    if (this.technicians.includes(val)) {
      this.showToast("⚠️ Este técnico ya se encuentra registrado.", "warning");
      return;
    }

    this.technicians.push(val);
    localStorage.setItem("compukit_technicians", JSON.stringify(this.technicians));
    input.value = "";
    this.renderTechnicianSelector();
    this.renderTechniciansManager();

    // Sincronizar con Google Sheets para que aparezca en los demás celulares
    this.syncTechniciansToCloud();
    this.showToast(`✅ Técnico añadido y sincronizado: "${val}"`, "success");
  }

  deleteTechnician(index) {
    if (this.technicians.length <= 1) {
      this.showToast("⚠️ Debes mantener al menos un técnico registrado.", "warning");
      return;
    }
    const removed = this.technicians.splice(index, 1);
    if (this.activeTechnician === removed[0]) {
      this.activeTechnician = this.technicians[0];
      localStorage.setItem("compukit_active_tech", this.activeTechnician);
    }
    localStorage.setItem("compukit_technicians", JSON.stringify(this.technicians));
    this.renderTechnicianSelector();
    this.renderTechniciansManager();

    // Sincronizar eliminación en la nube
    this.syncTechniciansToCloud();
  }

  syncTechniciansToCloud() {
    if (!this.sheetsUrl) return;
    this.queueSync({
      action: "update_technicians",
      technicians: this.technicians
    });
  }

  /* ==========================================
     SERVICIOS EDITABLES (PLANOS, MANTENIMIENTO, ETC)
     ========================================== */
  renderServiceChips() {
    const container = document.getElementById("equipment-type-chips");
    if (!container) return;

    container.innerHTML = this.services.map((svc, index) => {
      const isSelected = index === 0;
      return `
        <label class="chip-option ${isSelected ? 'selected' : ''}">
          <input type="radio" name="eq-type" value="${this.escapeHTML(svc)}" ${isSelected ? 'checked' : ''}>
          ${this.escapeHTML(svc)}
        </label>
      `;
    }).join("");

    this.bindEquipmentChipEvents();
  }

  bindEquipmentChipEvents() {
    document.querySelectorAll('#equipment-type-chips .chip-option').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#equipment-type-chips .chip-option').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        const radio = chip.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });
  }

  renderCustomServicesManager() {
    const container = document.getElementById("custom-services-list");
    if (!container) return;

    container.innerHTML = this.services.map((svc, index) => `
      <div style="display: inline-flex; align-items: center; gap: 6px; background-color: var(--bg-secondary); border: 2px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 12px; font-weight: bold; font-size: 0.95rem;">
        <span>${this.escapeHTML(svc)}</span>
        <button type="button" onclick="window.app && window.app.deleteCustomService(${index})" style="background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--danger); margin-left: 4px;" title="Eliminar servicio">❌</button>
      </div>
    `).join("");
  }

  addCustomService() {
    const input = document.getElementById("new-service-input");
    if (!input) return;
    const val = input.value.trim();
    if (!val) {
      this.showToast("⚠️ Por favor escribe el nombre del servicio.", "warning");
      return;
    }

    if (this.services.includes(val)) {
      this.showToast("⚠️ Este servicio ya se encuentra en la lista.", "warning");
      return;
    }

    this.services.push(val);
    localStorage.setItem("compukit_services", JSON.stringify(this.services));
    input.value = "";
    this.renderServiceChips();
    this.renderCustomServicesManager();
    this.showToast(`✅ Servicio añadido: "${val}"`, "success");
  }

  deleteCustomService(index) {
    if (this.services.length <= 1) {
      this.showToast("⚠️ Debes mantener al menos un servicio registrado.", "warning");
      return;
    }
    const removed = this.services.splice(index, 1);
    localStorage.setItem("compukit_services", JSON.stringify(this.services));
    this.renderServiceChips();
    this.renderCustomServicesManager();
  }

  /* ==========================================
     MANEJO DE TEMA Y NAVEGACIÓN
     ========================================== */
  setupTheme() {
    const savedTheme = localStorage.getItem("compukit_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    const themeBtn = document.getElementById("btn-theme-toggle");
    if (themeBtn) {
      themeBtn.textContent = savedTheme === "dark" ? "☀️" : "🌙";
      themeBtn.onclick = () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("compukit_theme", next);
        themeBtn.textContent = next === "dark" ? "☀️" : "🌙";
      };
    }
  }

  setupNavigation() {
    // Vincular botones de barra inferior de forma nativa
    const navButtons = document.querySelectorAll(".bottom-nav .nav-item");
    const views = ['view-ingreso', 'view-taller', 'view-reportes', 'view-config'];
    navButtons.forEach((btn, idx) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchView(views[idx], btn);
      });
    });
  }

  switchView(viewId, targetBtn) {
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
    const selectedView = document.getElementById(viewId);
    if (selectedView) selectedView.classList.add("active");

    if (targetBtn) {
      document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
      targetBtn.classList.add("active");
    }

    if (viewId === 'view-taller') {
      this.renderEquipmentList();
    } else if (viewId === 'view-reportes') {
      this.renderStats();
    } else if (viewId === 'view-config') {
      this.renderCustomServicesManager();
    }
  }

  toggleAccessoryChip(btn, accessoryName) {
    if (!btn) return;

    // Si selecciona "Sin Accesorios", deseleccionar los demás y ocultar input de "Otro"
    if (accessoryName === 'Sin Accesorios' || (btn.textContent && btn.textContent.includes('Ninguno'))) {
      const isSelected = btn.classList.contains('selected');
      document.querySelectorAll('#accessories-chips .chip-option').forEach(b => b.classList.remove('selected'));
      if (!isSelected) {
        btn.classList.add('selected');
      }
      const otherContainer = document.getElementById("other-accessory-container");
      if (otherContainer) otherContainer.style.display = "none";
    } else {
      // Si selecciona otro accesorio, quitar "Sin Accesorios"
      document.querySelectorAll('#accessories-chips .chip-option').forEach(b => {
        if (b.textContent.includes('Ninguno') || b.textContent.includes('Sin Accesorios')) {
          b.classList.remove('selected');
        }
      });
      btn.classList.toggle('selected');

      // Si es el botón de "Otro", mostrar u ocultar el campo de texto
      if (accessoryName === 'Otro' || (btn.textContent && btn.textContent.includes('Otro'))) {
        const otherContainer = document.getElementById("other-accessory-container");
        if (otherContainer) {
          otherContainer.style.display = btn.classList.contains('selected') ? "block" : "none";
          if (btn.classList.contains('selected')) {
            document.getElementById("other-accessory-input")?.focus();
          }
        }
      }
    }
  }

  setupChipHandlers() {
    const chips = document.querySelectorAll('#accessories-chips .chip-option');
    chips.forEach(chip => {
      chip.onclick = (e) => {
        if (e) e.preventDefault();
        const text = chip.textContent.trim();
        this.toggleAccessoryChip(chip, text);
      };
    });
  }

  /* ==========================================
     FORMULARIO GUIADO (WIZARD DE INGRESO)
     ========================================== */
  nextStep(targetStep) {
    if (targetStep > this.currentStep) {
      if (this.currentStep === 1) {
        const name = document.getElementById("client-name").value.trim();
        const phone = document.getElementById("client-phone").value.trim();
        if (!name || !phone) {
          this.showToast("⚠️ Ingresa el Nombre y el Teléfono del cliente para continuar.", "warning");
          return;
        }
      }
    }

    document.querySelectorAll(".wizard-step-content").forEach(el => el.classList.remove("active"));
    const nextStepEl = document.getElementById(`step-${targetStep}`);
    if (nextStepEl) nextStepEl.classList.add("active");

    for (let i = 1; i <= 4; i++) {
      const bubble = document.getElementById(`step-bubble-${i}`);
      if (bubble) {
        bubble.classList.remove("active", "completed");
        if (i < targetStep) bubble.classList.add("completed");
        if (i === targetStep) bubble.classList.add("active");
      }
    }

    this.currentStep = targetStep;

    if (targetStep === 4) {
      this.updateSummaryPreview();
    }
  }

  updateSummaryPreview() {
    const name = document.getElementById("client-name").value;
    const phone = document.getElementById("client-phone").value;
    const eqType = document.querySelector('input[name="eq-type"]:checked')?.value || "Laptop";
    const brand = document.getElementById("brand-model").value || "Sin especificar";
    const acc = this.getSelectedAccessories().join(", ") || "Ninguno";
    const issue = document.getElementById("issue-description").value || "Por diagnosticar";

    const previewEl = document.getElementById("summary-preview");
    if (previewEl) {
      previewEl.innerHTML = `
        <strong>Cliente:</strong> ${this.escapeHTML(name)} (${this.escapeHTML(phone)})<br>
        <strong>Equipo:</strong> ${this.escapeHTML(eqType)} - ${this.escapeHTML(brand)}<br>
        <strong>Accesorios:</strong> ${this.escapeHTML(acc)}<br>
        <strong>Falla:</strong> ${this.escapeHTML(issue)}
      `;
    }
  }

  getSelectedAccessories() {
    const list = [];
    document.querySelectorAll('#accessories-chips .chip-option.selected').forEach(btn => {
      const text = btn.textContent.trim();
      if (text.includes("Otro")) {
        const otherVal = document.getElementById("other-accessory-input")?.value.trim();
        list.push(otherVal ? `Otro (${otherVal})` : "Otro");
      } else {
        list.push(text);
      }
    });
    return list;
  }

  /* ==========================================
     DICTADO POR VOZ (SPEECH-TO-TEXT)
     ========================================== */
  setupVoiceDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById("btn-voice-dictate");
    const voiceStatus = document.getElementById("voice-status");

    if (!SpeechRecognition) {
      if (voiceStatus) voiceStatus.textContent = "Dictado por voz no disponible en este navegador. Puedes escribir con el teclado.";
      return;
    }

    this.speechRecognition = new SpeechRecognition();
    this.speechRecognition.lang = 'es-ES';
    this.speechRecognition.continuous = false;
    this.speechRecognition.interimResults = false;

    this.speechRecognition.onstart = () => {
      this.isRecording = true;
      if (micBtn) micBtn.classList.add("recording");
      if (voiceStatus) voiceStatus.textContent = "🎙️ Escuchando... Habla ahora claramente";
    };

    this.speechRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const textarea = document.getElementById("issue-description");
      if (textarea) {
        textarea.value = textarea.value ? textarea.value + " " + transcript : transcript;
      }
      if (voiceStatus) voiceStatus.textContent = "✅ Grabado con éxito";
    };

    this.speechRecognition.onerror = (event) => {
      console.warn("Error voz:", event.error);
      if (voiceStatus) voiceStatus.textContent = "⚠️ No se pudo escuchar. Vuelve a presionar el micrófono.";
    };

    this.speechRecognition.onend = () => {
      this.isRecording = false;
      if (micBtn) micBtn.classList.remove("recording");
    };

    if (micBtn) {
      micBtn.onclick = () => {
        if (this.isRecording) {
          this.speechRecognition.stop();
        } else {
          this.speechRecognition.start();
        }
      };
    }
  }

  startVoiceDictation(targetTextareaId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Dictado por voz no soportado.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.start();

    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      const area = document.getElementById(targetTextareaId);
      if (area) area.value = area.value ? area.value + " " + text : text;
    };
  }

  /* ==========================================
     COMPRESIÓN DE FOTOGRAFÍAS (CANVAS 1024px JPEG 0.7)
     ========================================== */
  handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const maxDim = 1024; // Máximo 1024px para no saturar datos móviles
        let w = img.width;
        let h = img.height;

        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        // Comprimir en JPEG calidad 0.7
        this.selectedPhotoBase64 = canvas.toDataURL("image/jpeg", 0.7);
        const previewImg = document.getElementById("img-preview");
        const previewContainer = document.getElementById("photo-preview");
        if (previewImg && previewContainer) {
          previewImg.src = this.selectedPhotoBase64;
          previewContainer.style.display = "flex";
        }
      };
    };
    reader.readAsDataURL(file);
  }

  /* ==========================================
     REGISTRO Y COLA OFFLINE
     ========================================== */
  async submitNewRecord() {
    const name = document.getElementById("client-name").value.trim();
    const phone = document.getElementById("client-phone").value.trim();
    const eqType = document.querySelector('input[name="eq-type"]:checked')?.value || "Laptop / Portátil";
    const brand = document.getElementById("brand-model").value.trim() || "Genérico";
    const accessories = this.getSelectedAccessories().join(", ") || "Ninguno";
    const issue = document.getElementById("issue-description").value.trim() || "Sin descripción";
    const cost = parseFloat(document.getElementById("cost-estimate").value) || 0;
    const advance = parseFloat(document.getElementById("cost-advance").value) || 0;

    if (!name || !phone) {
      this.showToast("⚠️ El nombre y el teléfono del cliente son requeridos.", "warning");
      this.nextStep(1);
      return;
    }

    const orderId = "CK-" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const nowStr = new Date().toLocaleString("es-ES");
    const techAssigned = document.getElementById("record-technician-select")?.value || this.activeTechnician || "Principal";

    const orderObj = {
      "action": "create",
      "ID_Orden": orderId,
      "Fecha_Ingreso": nowStr,
      "Cliente": name,
      "Telefono": phone,
      "Tipo_Equipo": eqType,
      "Marca_Modelo": brand,
      "Accesorios": accessories,
      "Falla_Reportada": issue,
      "Fotos_Drive_URL": "",
      "Foto_Base64": this.selectedPhotoBase64, // Se procesará y subirá a Drive
      "Estado": "Recibido",
      "Trabajo_Realizado": "",
      "Tecnico_Responsable": techAssigned,
      "Costo_Total": cost,
      "Abono": advance,
      "Saldo_Pendiente": cost - advance,
      "Fecha_Entrega": "",
      "Metodo_Pago": "Efectivo",
      "_sync_status": "Pendiente" // Estado offline inicial
    };

    // 1. Guardar de inmediato localmente
    this.orders.unshift(orderObj);
    this.saveOrdersLocal();

    // 2. Encolar para sincronización
    this.queueSync(orderObj);

    this.showToast(`✅ ¡Equipo ${orderId} guardado exitosamente!`, "success");

    // Resetear formulario
    document.getElementById("form-ingreso").reset();
    this.selectedPhotoBase64 = "";
    const previewContainer = document.getElementById("photo-preview");
    if (previewContainer) previewContainer.style.display = "none";
    this.nextStep(1);

    // Ir a la pestaña del Taller
    const navItems = document.querySelectorAll('.nav-item');
      if (navItems.length > 1) {
        this.switchView('view-taller', navItems[1]);
      } else {
        this.switchView('view-taller');
      }
  }

  saveStatusUpdate() {
    const orderId = document.getElementById("update-order-id").value;
    const newStatus = document.getElementById("update-status-select").value;
    const newIssue = document.getElementById("update-issue-description").value.trim();
    const workDone = document.getElementById("update-work-done").value.trim();
    const totalCost = parseFloat(document.getElementById("update-total-cost").value) || 0;
    const advanceInput = parseFloat(document.getElementById("update-advance-cost")?.value) || 0;
    const updatedTech = document.getElementById("update-technician-select")?.value || "Principal";

    const order = this.orders.find(o => o.ID_Orden === orderId);
    if (!order) return;

    const prevAbono = parseFloat(order.Abono || 0);
    const nowStr = new Date().toLocaleString("es-ES");
    order.Estado = newStatus;
    if (newIssue) order.Falla_Reportada = newIssue;
    order.Trabajo_Realizado = workDone;
    order.Costo_Total = totalCost;
    order.Tecnico_Responsable = updatedTech;

    let finalPayment = 0;
    let incrementalPayment = 0;

    if (newStatus === "Entregado") {
      order.Fecha_Entrega = nowStr;
      const paymentType = document.getElementById("update-payment-type")?.value || "FULL";
      const deliveryPaidInput = parseFloat(document.getElementById("delivery-amount-paid")?.value) || 0;

      if (paymentType === "FULL") {
        // Se cobró el saldo completo restante
        finalPayment = Math.max(0, totalCost - advanceInput);
        order.Abono = totalCost;
        order.Saldo_Pendiente = 0;
      } else if (paymentType === "PARTIAL") {
        // Se cobró un monto parcial al entregar
        finalPayment = deliveryPaidInput;
        order.Abono = advanceInput + deliveryPaidInput;
        order.Saldo_Pendiente = Math.max(0, totalCost - order.Abono);
      } else {
        // Sin cobro al entregar (quedó a crédito)
        finalPayment = 0;
        order.Abono = advanceInput;
        order.Saldo_Pendiente = Math.max(0, totalCost - advanceInput);
      }
    } else {
      // Si está en taller y el usuario registró un abono mayor al anterior
      if (advanceInput > prevAbono) {
        incrementalPayment = advanceInput - prevAbono;
      }
      order.Abono = advanceInput;
      order.Saldo_Pendiente = Math.max(0, totalCost - advanceInput);
    }

    order._sync_status = "Pendiente";
    this.saveOrdersLocal();

    const updatePayload = {
      action: "update_status",
      ID_Orden: orderId,
      Cliente: order.Cliente,
      Estado: newStatus,
      Falla_Reportada: order.Falla_Reportada,
      Trabajo_Realizado: workDone,
      Tecnico_Responsable: updatedTech,
      Costo_Total: totalCost,
      Abono: order.Abono,
      Fecha_Entrega: order.Fecha_Entrega || "",
      Cobro_Final: finalPayment,
      Pago_Incremental: incrementalPayment,
      Metodo_Pago: "Efectivo"
    };

    this.queueSync(updatePayload);

    this.closeModal("modal-status");
    this.renderEquipmentList();
    this.renderStats();

    let toastMsg = `✅ Estado actualizado: ${newStatus}`;
    if (newStatus === 'Entregado' && finalPayment > 0) {
      toastMsg += ` (Cobro de entrega: $${finalPayment.toFixed(2)})`;
    } else if (incrementalPayment > 0) {
      toastMsg += ` (Abono adicional recibido: $${incrementalPayment.toFixed(2)})`;
    }
    if (order.Saldo_Pendiente > 0) {
      toastMsg += ` [Pendiente: $${order.Saldo_Pendiente.toFixed(2)}]`;
    }
    this.showToast(toastMsg, "success");
  }

  /* ==========================================
     MANEJO DE SECCIÓN DE COBRO EN MODAL
     ========================================== */
  onStatusSelectChange() {
    const status = document.getElementById("update-status-select").value;
    const deliverySection = document.getElementById("delivery-payment-section");
    if (deliverySection) {
      if (status === "Entregado") {
        deliverySection.style.display = "block";
        this.onPaymentTypeChange();
      } else {
        deliverySection.style.display = "none";
      }
    }
  }

  onPaymentTypeChange() {
    const type = document.getElementById("update-payment-type")?.value || "FULL";
    const amountGroup = document.getElementById("delivery-amount-group");
    const totalCost = parseFloat(document.getElementById("update-total-cost")?.value) || 0;
    const advance = parseFloat(document.getElementById("update-advance-cost")?.value) || 0;
    const pendingBalance = Math.max(0, totalCost - advance);

    const paidInput = document.getElementById("delivery-amount-paid");

    if (type === "FULL") {
      if (amountGroup) amountGroup.style.display = "none";
      if (paidInput) paidInput.value = pendingBalance.toFixed(2);
    } else if (type === "PARTIAL") {
      if (amountGroup) amountGroup.style.display = "block";
      if (paidInput && (!paidInput.value || parseFloat(paidInput.value) <= 0)) {
        paidInput.value = (pendingBalance / 2).toFixed(2);
      }
    } else {
      // NONE
      if (amountGroup) amountGroup.style.display = "none";
      if (paidInput) paidInput.value = "0.00";
    }

    this.recalculateDeliveryBalance();
  }

  recalculateDeliveryBalance() {
    const totalCost = parseFloat(document.getElementById("update-total-cost")?.value) || 0;
    const advance = parseFloat(document.getElementById("update-advance-cost")?.value) || 0;
    const type = document.getElementById("update-payment-type")?.value || "FULL";
    const preview = document.getElementById("delivery-balance-preview");
    if (!preview) return;

    let pendingAfterDelivery = 0;
    if (type === "FULL") {
      pendingAfterDelivery = 0;
    } else if (type === "PARTIAL") {
      const deliveryPaid = parseFloat(document.getElementById("delivery-amount-paid")?.value) || 0;
      pendingAfterDelivery = Math.max(0, totalCost - advance - deliveryPaid);
    } else {
      pendingAfterDelivery = Math.max(0, totalCost - advance);
    }

    preview.innerHTML = pendingAfterDelivery > 0
      ? `⚠️ Saldo que quedará pendiente por cobrar: <span style="color: var(--danger); font-size: 1.15rem;">$${pendingAfterDelivery.toFixed(2)}</span>`
      : `✅ ¡Todo pagado! Saldo restante: <span style="color: var(--success); font-size: 1.15rem;">$0.00</span>`;
  }

  /* ==========================================
     SINCRONIZACIÓN RESILIENTE CON APPS SCRIPT
     ========================================== */
  queueSync(payload) {
    this.syncQueue.push(payload);
    this.saveQueueLocal();
    this.processSyncQueue();
  }

  async processSyncQueue() {
    if (!this.sheetsUrl || this.syncQueue.length === 0 || !navigator.onLine) {
      this.updateSyncBadge();
      return;
    }

    if (this._isSyncingQueue) return;
    this._isSyncingQueue = true;
    this.updateSyncBadge("syncing");

    try {
      while (this.syncQueue.length > 0) {
        const item = this.syncQueue[0];
        try {
          const cleanUrl = this.sheetsUrl.trim();
          const response = await fetch(cleanUrl, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(item),
            redirect: "follow"
          });

          if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
          }

          const rawText = await response.text();
          let result;
          try {
            result = JSON.parse(rawText);
          } catch(e) {
            throw new Error("Respuesta del servidor no es JSON: " + rawText.substring(0, 80));
          }

          if (result.status === "success") {
            // Marcar orden local como sincronizada
            const targetId = item.ID_Orden || result.orderId;
            const localOrder = this.orders.find(o => o.ID_Orden === targetId);
            if (localOrder) {
              localOrder._sync_status = "Sincronizado";
              if (result.photoUrl) localOrder.Fotos_Drive_URL = result.photoUrl;
            }
            this.syncQueue.shift(); // Quitar elemento procesado
            this.saveQueueLocal();
            this.saveOrdersLocal();
          } else {
            console.warn("Aviso recibido de Google Apps Script:", result);
            item._retry_count = (item._retry_count || 0) + 1;
            if (item._retry_count >= 3) {
              console.error("Descartando elemento no sincronizable tras 3 intentos:", item, result.message);
              this.syncQueue.shift();
              this.saveQueueLocal();
            } else {
              break;
            }
          }
        } catch (err) {
          console.warn("Fallo temporal de conexión al sincronizar con Apps Script (reintentará):", err);
          break;
        }
      }
    } finally {
      this._isSyncingQueue = false;
      this.updateSyncBadge();
      this.renderEquipmentList();
      this.renderStats();
    }
  }

  mergeRemoteOrders(remoteOrders) {
    if (!Array.isArray(remoteOrders)) return;

    const remoteList = remoteOrders.slice().reverse().map(o => ({
      ...o,
      Costo_Total: parseFloat(o.Costo_Total) || 0,
      Abono: parseFloat(o.Abono) || 0,
      Saldo_Pendiente: parseFloat(o.Saldo_Pendiente) || 0,
      _sync_status: "Sincronizado"
    }));

    // Preservar órdenes locales creadas u offline que estén pendientes de subida
    const pendingLocalOrders = this.orders.filter(local => local._sync_status === "Pendiente");

    const mergedMap = new Map();
    remoteList.forEach(order => {
      if (order.ID_Orden) mergedMap.set(order.ID_Orden, order);
    });

    // Sobreescribir con las locales pendientes para no perder cambios recientes
    pendingLocalOrders.forEach(local => {
      if (local.ID_Orden) mergedMap.set(local.ID_Orden, local);
    });

    this.orders = Array.from(mergedMap.values()).sort((a, b) => {
      const dateA = new Date(a.Fecha_Ingreso || 0).getTime() || 0;
      const dateB = new Date(b.Fecha_Ingreso || 0).getTime() || 0;
      return dateB - dateA;
    });

    this.saveOrdersLocal();
  }

  async fetchFromSheets(isManualTest = false) {
    if (!this.sheetsUrl || !navigator.onLine) {
      if (!this.sheetsUrl && isManualTest) {
        const resEl = document.getElementById("config-test-result");
        if (resEl) resEl.innerHTML = `<span style="color: var(--danger);">⚠️ Ingresa una URL válida de Apps Script.</span>`;
      }
      return;
    }

    const resEl = document.getElementById("config-test-result");
    try {
      this.updateSyncBadge("syncing");
      if (resEl && isManualTest) {
        resEl.innerHTML = `<span style="color: var(--primary);">⏳ Conectando con Google Sheets y Apps Script...</span>`;
      }

      const cleanUrl = this.sheetsUrl.trim();
      const testUrl = cleanUrl.includes("?") ? `${cleanUrl}&action=read` : `${cleanUrl}?action=read`;
      const resp = await fetch(testUrl, { redirect: "follow" });

      if (!resp.ok) {
        throw new Error(`Error de servidor HTTP ${resp.status}`);
      }

      const rawText = await resp.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        if (rawText.includes("<!DOCTYPE") || rawText.includes("<html")) {
          throw new Error("Google devolvió una página HTML en lugar de datos JSON. Asegúrate de configurar en Apps Script: Desplegar > Aplicación web > Quién tiene acceso: 'Cualquier persona' (Anyone).");
        }
        throw new Error("Respuesta no válida del servidor: " + rawText.substring(0, 90));
      }

      if (data.status === "success") {
        if (Array.isArray(data.orders)) {
          this.mergeRemoteOrders(data.orders);
        }
        if (Array.isArray(data.cashFlow)) {
          this.cashFlow = data.cashFlow;
          localStorage.setItem("compukit_cashflow", JSON.stringify(this.cashFlow));
        }

        if (Array.isArray(data.technicians) && data.technicians.length > 0) {
          this.technicians = data.technicians;
          localStorage.setItem("compukit_technicians", JSON.stringify(this.technicians));
          if (!this.technicians.includes(this.activeTechnician)) {
            this.activeTechnician = this.technicians[0];
            localStorage.setItem("compukit_active_tech", this.activeTechnician);
          }
          this.renderTechnicianSelector();
          this.renderTechniciansManager();
        }

        if (resEl) {
          const totalOrders = data.orders ? data.orders.length : 0;
          resEl.innerHTML = `<span style="color: var(--success);">✅ Conexión Exitosa. Sincronizado con Google Sheets (${totalOrders} órdenes cargadas).</span>`;
        }

        this.renderEquipmentList();
        this.renderStats();

        // Procesar cualquier elemento en cola acumulado
        this.processSyncQueue();
      } else {
        throw new Error(data.message || "Error devuelto por Apps Script.");
      }
    } catch (err) {
      console.warn("Error al consultar Google Sheets:", err);
      if (resEl) {
        resEl.innerHTML = `<span style="color: var(--danger);">❌ ${this.escapeHTML(err.message || err.toString())}</span>`;
      }
    } finally {
      this.updateSyncBadge();
    }
  }

  setupSearchHandler() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      // Escuchar eventos input, keyup y search (cuando se borra con la X del navegador)
      ['input', 'keyup', 'change', 'search'].forEach(evt => {
        searchInput.addEventListener(evt, () => {
          this.filterRecords();
        });
      });
    }
  }

  saveSheetsUrl() {
    let input = (document.getElementById("sheets-url-input")?.value || "").trim();
    const resEl = document.getElementById("config-test-result");

    if (!input) {
      this.showToast("⚠️ Por favor ingresa la URL de Apps Script.", "warning");
      return;
    }

    // Corregir si el usuario pegó la URL de edición de Apps Script
    if (input.includes("/edit")) {
      input = input.replace(/\/edit.*$/, "/exec");
      const urlInputEl = document.getElementById("sheets-url-input");
      if (urlInputEl) urlInputEl.value = input;
    }

    // Validar si pegó la URL de Google Sheets en vez de Apps Script
    if (input.includes("docs.google.com/spreadsheets")) {
      if (resEl) {
        resEl.innerHTML = `<span style="color: var(--danger);">⚠️ Has pegado el enlace de la hoja de Google Sheets. Debes pegar la URL de la Aplicación Web de Apps Script (terminada en <code>/exec</code>). Consulta la guía abajo.</span>`;
      }
      return;
    }

    this.sheetsUrl = input;
    localStorage.setItem("compukit_sheets_url", input);
    this.updateSyncBadge();
    this.fetchFromSheets(true);
  }

  updateSyncBadge(customState) {
    const dot = document.getElementById("sync-dot");
    const text = document.getElementById("sync-text");
    if (!dot || !text) return;

    const pendingCount = this.syncQueue.length;

    if (customState === "syncing") {
      dot.className = "sync-dot offline";
      text.textContent = "Sincronizando...";
      return;
    }

    if (pendingCount > 0) {
      dot.className = "sync-dot offline";
      text.textContent = `${pendingCount} pendiente(s)`;
    } else if (this.sheetsUrl) {
      dot.className = "sync-dot online";
      text.textContent = "Google Sheets Conectado";
    } else {
      dot.className = "sync-dot offline";
      text.textContent = "Modo Local";
    }
  }

  saveOrdersLocal() {
    localStorage.setItem("compukit_orders", JSON.stringify(this.orders));
  }

  saveQueueLocal() {
    localStorage.setItem("compukit_sync_queue", JSON.stringify(this.syncQueue));
  }

  /* ==========================================
     RENDERIZADO Y FILTRADO
     ========================================== */
  setFilterStatus(status, chipBtn) {
    this.activeFilter = status;
    if (chipBtn) {
      document.querySelectorAll('#view-taller .chip-option').forEach(c => c.classList.remove('selected'));
      chipBtn.classList.add('selected');
    }
    this.renderEquipmentList();
  }

  filterRecords() {
    this.renderEquipmentList();
  }

  renderEquipmentList() {
    const container = document.getElementById("equipment-list");
    if (!container) return;

    const searchTerm = (document.getElementById("search-input")?.value || "").toLowerCase();
    const selectedTechFilter = document.getElementById("filter-technician-select")?.value || "TODOS";

    let filtered = this.orders.filter(r => {
      const matchSearch =
        (r.Cliente || "").toLowerCase().includes(searchTerm) ||
        (r.Telefono || "").toLowerCase().includes(searchTerm) ||
        (r.Tipo_Equipo || "").toLowerCase().includes(searchTerm) ||
        (r.Marca_Modelo || "").toLowerCase().includes(searchTerm) ||
        (r.Falla_Reportada || "").toLowerCase().includes(searchTerm) ||
        (r.Tecnico_Responsable || "").toLowerCase().includes(searchTerm) ||
        (r.ID_Orden || "").toLowerCase().includes(searchTerm);

      if (!matchSearch) return false;

      if (selectedTechFilter !== "TODOS" && (r.Tecnico_Responsable || "Principal") !== selectedTechFilter) {
        return false;
      }

      if (this.activeFilter === "TODOS") return true;
      if (this.activeFilter === "EN_TALLER") {
        return r.Estado !== "Entregado";
      }
      return r.Estado === this.activeFilter;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; background-color: var(--bg-card); border-radius: var(--radius-md); border: 2px dashed var(--border-color);">
          <div style="font-size: 3rem; margin-bottom: 8px;">📋</div>
          <h3>No se encontraron equipos</h3>
          <p style="color: var(--text-muted); font-size: 0.95rem;">Prueba con otra búsqueda o registra un nuevo equipo.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(r => {
      const safeId = this.escapeHTML(r.ID_Orden || "");
      const imgUrl = this.getEquipmentImageUrl(r);
      const safeClient = this.escapeHTML(r.Cliente || "Sin Nombre");
      const safeDriveUrl = r.Fotos_Drive_URL || "";

      return `
      <div class="equipment-card">
        <div class="card-top">
          <div>
            <div class="client-name">👤 ${safeClient}</div>
            <div style="font-size: 0.95rem; color: var(--text-muted); font-weight: bold;">📞 ${this.escapeHTML(r.Telefono || "")}</div>
          </div>
          <span class="order-id">${safeId}</span>
        </div>

        ${imgUrl ? `
        <div class="card-photo-wrapper" onclick="window.app && window.app.openPhotoViewer('${imgUrl}', '${safeId}', '${safeClient}', '${safeDriveUrl}')" title="Toca para ver la foto en grande">
          <img src="${imgUrl}" alt="Foto ${safeId}" class="card-photo-thumb" loading="lazy" onerror="this.parentElement.style.display='none'">
          <span class="card-photo-badge">📷 Ver Foto</span>
        </div>
        ` : ''}

        <div class="equipment-info">
          <div>
            <div class="info-label">Equipo</div>
            <div class="info-val">💻 ${this.escapeHTML(r.Tipo_Equipo || "")} ${this.escapeHTML(r.Marca_Modelo || "")}</div>
          </div>
          <div>
            <div class="info-label">Costo Total</div>
            <div class="info-val" style="color: var(--success); font-size: 1.2rem;">$${parseFloat(r.Costo_Total || 0).toFixed(2)}</div>
          </div>
        </div>

        <div style="font-size: 0.95rem;">
          <strong>🔌 Accesorios:</strong> ${this.escapeHTML(r.Accesorios || "Ninguno")}
        </div>

        <div style="font-size: 0.95rem; background-color: var(--bg-secondary); padding: 8px; border-radius: var(--radius-sm);">
          <strong>🔍 Diagnóstico / Falla:</strong> ${this.escapeHTML(r.Falla_Reportada || "Sin detalle")}
          ${r.Trabajo_Realizado ? `<br><strong style="color: var(--primary);">🛠️ Trabajo / Repuestos:</strong> ${this.escapeHTML(r.Trabajo_Realizado)}` : ''}
          ${r.Tecnico_Responsable ? `<br><strong style="color: var(--text-muted);">👨‍🔧 Atendido por:</strong> <span style="font-weight: bold; color: var(--text-main);">${this.escapeHTML(r.Tecnico_Responsable)}</span>` : ''}
          ${r.Fotos_Drive_URL ? `<br><strong style="color: var(--info);">📁 Foto Drive:</strong> <a href="${r.Fotos_Drive_URL}" target="_blank" style="color: var(--primary); text-decoration: underline;">Abrir en Drive</a>` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span class="status-pill" data-status="${r.Estado || "Recibido"}">
            ● ${r.Estado || "Recibido"}
          </span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            ${r._sync_status === "Pendiente" ? "⏳ Guardado local" : "☁️ Sincronizado"}
          </span>
        </div>

        <div class="card-actions">
          <button class="btn btn-secondary btn-sm" onclick="window.app && window.app.openUpdateModal('${safeId}')">
            📝 Diagnóstico / Estado
          </button>
          <button class="btn btn-whatsapp btn-sm" onclick="window.app && window.app.sendWhatsAppByOrderId('${safeId}')">
            💬 WhatsApp
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.app && window.app.showTicketModal('${safeId}')">
            📄 Ticket PDF
          </button>
        </div>
      </div>
    `;
    }).join("");
  }

  renderStats() {
    let totalCollected = 0;
    let totalPending = 0;
    let activeEquip = 0;
    let readyEquip = 0;
    const deliveredList = [];
    const pendingDebtsList = [];

    this.orders.forEach(r => {
      const cost = parseFloat(r.Costo_Total || 0);
      const abono = parseFloat(r.Abono || 0);
      const pending = Math.max(0, cost - abono);
      const status = r.Estado || "Recibido";

      // 1. Dinero real ingresado (abonos y pagos realizados)
      totalCollected += abono;

      // 2. Dinero pendiente por cobrar
      if (pending > 0 && cost > 0) {
        totalPending += pending;
        pendingDebtsList.push({
          ...r,
          calculatedPending: pending
        });
      }

      if (status === "Entregado") {
        deliveredList.push(r);
      } else {
        activeEquip++;
        if (status === "Listo") readyEquip++;
      }
    });

    // Ordenar deudores por mayor saldo pendiente primero
    pendingDebtsList.sort((a, b) => b.calculatedPending - a.calculatedPending);

    const statMoney = document.getElementById("stat-total-money");
    const statPending = document.getElementById("stat-total-pending");
    const statActive = document.getElementById("stat-active-equip");
    const statReady = document.getElementById("stat-ready-equip");
    const debtsBadge = document.getElementById("pending-debts-badge");

    if (statMoney) statMoney.textContent = `$${totalCollected.toFixed(2)}`;
    if (statPending) statPending.textContent = `$${totalPending.toFixed(2)}`;
    if (statActive) statActive.textContent = activeEquip;
    if (statReady) statReady.textContent = readyEquip;
    if (debtsBadge) debtsBadge.textContent = pendingDebtsList.length;

    // Renderizar lista detallada de cuentas por cobrar
    const debtsContainer = document.getElementById("pending-debts-list");
    if (debtsContainer) {
      if (pendingDebtsList.length === 0) {
        debtsContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: var(--success); font-weight: bold; background-color: var(--bg-card); border-radius: var(--radius-sm);">
            🎉 ¡Excelente! No hay clientes con saldo pendiente de pago.
          </div>
        `;
      } else {
        debtsContainer.innerHTML = pendingDebtsList.map(r => {
          const isDelivered = r.Estado === "Entregado";
          const safeId = this.escapeHTML(r.ID_Orden || "");
          return `
            <div class="debt-card">
              <div class="debt-header">
                <div>
                  <div class="debt-client">👤 ${this.escapeHTML(r.Cliente || "Sin Nombre")}</div>
                  <div style="font-size: 0.85rem; color: var(--text-muted);">📞 ${this.escapeHTML(r.Telefono || "Sin Teléfono")} | <strong>${safeId}</strong></div>
                </div>
                <div style="text-align: right;">
                  <div class="debt-amount">$${r.calculatedPending.toFixed(2)}</div>
                  <span style="font-size: 0.75rem; font-weight: 800; color: ${isDelivered ? 'var(--danger)' : 'var(--warning)'};">
                    ${isDelivered ? '🔴 ENTREGADO (A CRÉDITO)' : '🟡 EN TALLER'}
                  </span>
                </div>
              </div>

              <div class="debt-meta">
                💻 <strong>${this.escapeHTML(r.Tipo_Equipo || "")} ${this.escapeHTML(r.Marca_Modelo || "")}</strong><br>
                <span>Costo Total: $${parseFloat(r.Costo_Total || 0).toFixed(2)} | Abono Recibido: $${parseFloat(r.Abono || 0).toFixed(2)}</span>
                ${r.Trabajo_Realizado ? `<br><em>Trabajo: ${this.escapeHTML(r.Trabajo_Realizado)}</em>` : ''}
              </div>

              <div class="debt-actions">
                <button class="btn btn-whatsapp btn-sm" onclick="window.app && window.app.sendWhatsAppDebtReminder('${safeId}')" title="Enviar recordatorio de cobro por WhatsApp">
                  💬 Cobrar por WhatsApp
                </button>
                <button class="btn btn-primary btn-sm" onclick="window.app && window.app.openUpdateModal('${safeId}')" title="Registrar pago de saldo">
                  💵 Registrar Pago / Liquidar
                </button>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // Renderizar historial de entregas
    const listEl = document.getElementById("recent-delivered-list");
    if (listEl) {
      if (deliveredList.length === 0) {
        listEl.innerHTML = `<p style="color: var(--text-muted);">No hay entregas registradas aún.</p>`;
      } else {
        listEl.innerHTML = deliveredList.slice(0, 8).map(r => {
          const total = parseFloat(r.Costo_Total || 0);
          const abono = parseFloat(r.Abono || 0);
          const pend = Math.max(0, total - abono);
          const isFullyPaid = pend <= 0;

          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
              <div>
                <strong>${this.escapeHTML(r.Cliente)}</strong> (${this.escapeHTML(r.Tipo_Equipo)})
                <div style="font-size: 0.85rem; color: var(--text-muted);">
                  Entregado: ${r.Fecha_Entrega || r.Fecha_Ingreso || "Reciente"} | N°: ${this.escapeHTML(r.ID_Orden)}
                </div>
                <div>
                  <span style="font-size: 0.8rem; font-weight: bold; color: ${isFullyPaid ? 'var(--success)' : 'var(--danger)'};">
                    ${isFullyPaid ? '✅ Cancelado 100%' : `⚠️ Pendiente: $${pend.toFixed(2)}`}
                  </span>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 1.15rem; font-weight: bold; color: var(--success);">$${total.toFixed(2)}</div>
                <button class="btn btn-secondary btn-sm" style="margin-top: 4px; padding: 4px 8px; font-size: 0.8rem;" onclick="window.app && window.app.openUpdateModal('${this.escapeHTML(r.ID_Orden)}')">
                  📝 Ver / Editar
                </button>
              </div>
            </div>
          `;
        }).join("");
      }
    }
  }

  /* ==========================================
     WHATSAPP, MODALES Y TICKETS
     ========================================== */
  sendWhatsAppDebtReminder(orderId) {
    const order = this.orders.find(o => String(o.ID_Orden).trim() === String(orderId).trim());
    if (!order) return;

    let cleanPhone = String(order.Telefono || "").replace(/\D/g, "");
    if (!cleanPhone) {
      this.showToast("⚠️ Número de teléfono no válido.", "warning");
      return;
    }

    if (!cleanPhone.startsWith("593") && cleanPhone.startsWith("0")) {
      cleanPhone = "593" + cleanPhone.substring(1);
    }

    const cleanEquipment = String(order.Tipo_Equipo || "Equipo").replace(/[^\p{L}\p{N}\s\/\-\.]/gu, "").trim();
    const totalCost = parseFloat(order.Costo_Total || 0);
    const advance = parseFloat(order.Abono || 0);
    const pendingBalance = Math.max(0, totalCost - advance);

    const msg = `Hola *${order.Cliente || 'Estimado/a cliente'}*, le saludamos cordialmente de *COMPUKIT*.\n\nLe recordamos que mantiene un saldo pendiente de pago por el servicio de su *${cleanEquipment}*:\n\n` +
      `📋 *N° Orden:* ${order.ID_Orden}\n` +
      `💵 *Costo Total:* $${totalCost.toFixed(2)}\n` +
      `✅ *Abono recibido:* $${advance.toFixed(2)}\n` +
      `🔴 *Saldo Pendiente:* *$${pendingBalance.toFixed(2)}*\n\n` +
      `Puede cancelar su saldo pendiente en nuestro local (efectivo o transferencia). ¡Agradecemos su preferencia!`;

    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");
  }

  sendWhatsAppByOrderId(orderId) {
    const order = this.orders.find(o => o.ID_Orden === orderId);
    if (!order) return;
    this.sendWhatsApp(order.Telefono, order.Cliente, order.Tipo_Equipo, order.Estado, order.Costo_Total, order.Falla_Reportada, order.Trabajo_Realizado);
  }

  sendWhatsApp(phone, name, equipment, status, cost, issue, workDone) {
    let cleanPhone = String(phone || "").replace(/\D/g, "");
    if (!cleanPhone) {
      this.showToast("⚠️ Número de teléfono no válido.", "warning");
      return;
    }

    if (!cleanPhone.startsWith("593") && cleanPhone.startsWith("0")) {
      cleanPhone = "593" + cleanPhone.substring(1);
    }

    // Limpiar posibles emojis rotos o caracteres incompatibles en el tipo de equipo
    const cleanEquipment = String(equipment || "Equipo").replace(/[^\p{L}\p{N}\s\/\-\.]/gu, "").trim();

    const formattedCost = `$${parseFloat(cost || 0).toFixed(2)}`;
    const issueDetail = issue ? `\n*Diagnóstico / Falla:* ${issue}` : "";
    const workDetail = workDone ? `\n*Solución / Trabajo:* ${workDone}` : "";

    let msg = "";
    if (status === "Esperando Aprobación") {
      msg = `Hola ${name}, le saludamos de *COMPUKIT*.\n\nHemos finalizado la revisión y diagnóstico de su *${cleanEquipment}*:\n${issueDetail}${workDetail}\n\n*Costo Estimado:* *${formattedCost}*\n\n¿Desea que procedamos con el trabajo? Por favor nos confirma para iniciar.`;
    } else if (status === "En Diagnóstico") {
      msg = `Hola ${name}, le saludamos de *COMPUKIT*. Le informamos que su *${cleanEquipment}* se encuentra actualmente en proceso de *revisión y diagnóstico técnico*. Le notificaremos apenas tengamos el informe detallado y costo.`;
    } else if (status === "En Reparación") {
      msg = `Hola ${name}, le saludamos de *COMPUKIT*. Le confirmamos que su *${cleanEquipment}* ya se encuentra *en proceso de reparación*.`;
    } else if (status === "Listo") {
      msg = `Hola ${name}, le saludamos de *COMPUKIT*. ¡Su *${cleanEquipment}* ya está *LISTO* para retirar!\n\n*Total a pagar:* *${formattedCost}*\n\nPuede pasar retirándolo en nuestro horario habitual.`;
    } else if (status === "Entregado") {
      msg = `Hola ${name}, gracias por confiar en *COMPUKIT*. Le confirmamos la entrega conforme de su *${cleanEquipment}*. ¡Estamos a la orden!`;
    } else {
      msg = `Hola ${name}, le saludamos de *COMPUKIT*. Su equipo *${cleanEquipment}* se encuentra registrado en estado: *${status}*.`;
    }

    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");
  }

  getEquipmentImageUrl(order) {
    if (!order) return "";
    if (order.Foto_Base64 && order.Foto_Base64.startsWith("data:image")) {
      return order.Foto_Base64;
    }
    const url = order.Fotos_Drive_URL || "";
    if (!url) return "";
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
    }
    return url;
  }

  openPhotoViewer(imgUrl, orderId = "", clientName = "", driveUrl = "") {
    if (!imgUrl) return;
    const imgEl = document.getElementById("photo-viewer-img");
    const titleEl = document.getElementById("photo-viewer-title");
    const linkEl = document.getElementById("photo-viewer-drive-link");
    const modal = document.getElementById("modal-photo-viewer");

    if (imgEl) imgEl.src = imgUrl;
    if (titleEl) {
      titleEl.textContent = `📷 ${clientName ? clientName + ' - ' : ''}${orderId || 'Foto del Equipo'}`;
    }
    if (linkEl) {
      if (driveUrl) {
        linkEl.href = driveUrl;
        linkEl.style.display = "inline-flex";
      } else {
        linkEl.style.display = "none";
      }
    }
    if (modal) modal.classList.add("active");
  }

  openUpdateModal(orderId) {
    const order = this.orders.find(o => String(o.ID_Orden).trim() === String(orderId).trim());
    if (!order) return;

    // Mostrar foto del equipo si existe
    const imgUrl = this.getEquipmentImageUrl(order);
    const photoContainer = document.getElementById("update-photo-container");
    const photoImg = document.getElementById("update-photo-img");
    if (photoContainer && photoImg) {
      if (imgUrl) {
        photoImg.src = imgUrl;
        photoContainer.style.display = "block";
      } else {
        photoContainer.style.display = "none";
      }
    }

    document.getElementById("update-order-id").value = orderId;
    document.getElementById("update-status-select").value = order.Estado || "Recibido";
    document.getElementById("update-issue-description").value = order.Falla_Reportada || "";
    document.getElementById("update-work-done").value = order.Trabajo_Realizado || "";
    document.getElementById("update-total-cost").value = order.Costo_Total || 0;
    const advanceInput = document.getElementById("update-advance-cost");
    if (advanceInput) advanceInput.value = order.Abono || 0;

    const techSelect = document.getElementById("update-technician-select");
    if (techSelect) techSelect.value = order.Tecnico_Responsable || this.activeTechnician || "Principal";

    const deliverySection = document.getElementById("delivery-payment-section");
    const paymentTypeSelect = document.getElementById("update-payment-type");
    const deliveryPaidInput = document.getElementById("delivery-amount-paid");

    const totalCost = parseFloat(order.Costo_Total || 0);
    const initialAdvance = parseFloat(order.Abono || 0);
    const currentPending = Math.max(0, totalCost - initialAdvance);

    if (order.Estado === "Entregado") {
      if (deliverySection) deliverySection.style.display = "block";
      if (currentPending <= 0) {
        if (paymentTypeSelect) paymentTypeSelect.value = "FULL";
        if (deliveryPaidInput) deliveryPaidInput.value = "0.00";
      } else {
        // Si ya estaba entregado y tenía deuda, no marcarlo como FULL por error
        if (paymentTypeSelect) paymentTypeSelect.value = "NONE";
        if (deliveryPaidInput) deliveryPaidInput.value = "0.00";
      }
    } else {
      if (deliverySection) deliverySection.style.display = "none";
      if (paymentTypeSelect) paymentTypeSelect.value = "FULL";
      if (deliveryPaidInput) deliveryPaidInput.value = currentPending.toFixed(2);
    }

    this.recalculateDeliveryBalance();
    document.getElementById("modal-status").classList.add("active");
  }

  cleanTextForTicket(str) {
    if (!str) return "";
    // Remover emojis, símbolos gráficos de 4 bytes y dejar caracteres latinos legibles
    return String(str)
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{2388}-\u{2B55}\u{FE00}-\u{FE0F}]/gu, "")
      .replace(/[ØÜË»Ý]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  showTicketModal(orderId) {
    if (!orderId) {
      alert("No se pudo identificar la orden para el ticket.");
      return;
    }

    const order = this.orders.find(o => String(o.ID_Orden).trim() === String(orderId).trim());
    if (!order) {
      alert(`No se encontró la orden ${orderId}`);
      return;
    }

    this.currentTicketRecord = order;

    const dateStr = order.Fecha_Ingreso || new Date().toLocaleString();
    const idStr = order.ID_Orden || "";
    const clientStr = this.cleanTextForTicket(order.Cliente) || "Consumidor Final";
    const phoneStr = order.Telefono || "S/N";
    const eqStr = `${this.cleanTextForTicket(order.Tipo_Equipo)} - ${this.cleanTextForTicket(order.Marca_Modelo)}`.trim();
    const accStr = this.cleanTextForTicket(order.Accesorios) || "Ninguno";
    const issueStr = this.cleanTextForTicket(order.Falla_Reportada) || "Sin detalle";
    const totalCostStr = `$${parseFloat(order.Costo_Total || 0).toFixed(2)}`;
    const advanceStr = `$${parseFloat(order.Abono || 0).toFixed(2)}`;
    const balanceStr = `$${parseFloat(order.Saldo_Pendiente || 0).toFixed(2)}`;
    const techStr = order.Tecnico_Responsable || "Principal";

    // Llenar ambas copias (Cliente y Taller)
    document.querySelectorAll(".ticket-date-val").forEach(el => el.textContent = dateStr);
    document.querySelectorAll(".ticket-id-val").forEach(el => el.textContent = idStr);
    document.querySelectorAll(".ticket-client-val").forEach(el => el.textContent = clientStr);
    document.querySelectorAll(".ticket-phone-val").forEach(el => el.textContent = phoneStr);
    document.querySelectorAll(".ticket-equipment-val").forEach(el => el.textContent = eqStr);
    document.querySelectorAll(".ticket-acc-val").forEach(el => el.textContent = accStr);
    document.querySelectorAll(".ticket-tech-val").forEach(el => el.textContent = techStr);
    document.querySelectorAll(".ticket-issue-val").forEach(el => el.textContent = issueStr);
    document.querySelectorAll(".ticket-cost-val").forEach(el => el.textContent = totalCostStr);
    document.querySelectorAll(".ticket-advance-val").forEach(el => el.textContent = advanceStr);
    document.querySelectorAll(".ticket-balance-val").forEach(el => el.textContent = balanceStr);

    const modalEl = document.getElementById("modal-ticket");
    if (modalEl) {
      modalEl.classList.add("active");
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
  }

  downloadPDFTicket() {
    if (!window.jspdf) {
      this.showToast("⏳ El generador de PDF se está cargando...", "info");
      return;
    }
    const { jsPDF } = window.jspdf;
    // Formato estándar A4 con dos copias
    const doc = new jsPDF({
      unit: 'mm',
      format: 'a4'
    });

    const rec = this.currentTicketRecord;
    if (!rec) return;

    const cleanClient = this.cleanTextForTicket(rec.Cliente) || "Consumidor Final";
    const cleanEq = `${this.cleanTextForTicket(rec.Tipo_Equipo)} - ${this.cleanTextForTicket(rec.Marca_Modelo)}`.trim();
    const cleanAcc = this.cleanTextForTicket(rec.Accesorios) || "Ninguno";
    const cleanIssue = this.cleanTextForTicket(rec.Falla_Reportada) || "Por diagnosticar";

    // Función para renderizar 1 copia 100% limpia sin emojis
    const printCopy = (startY, titleTag) => {
      let y = startY;
      doc.setFillColor(240, 240, 240);
      doc.rect(15, y, 180, 8, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(titleTag, 105, y + 5.5, { align: "center" });
      y += 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("COMPUKIT - TALLER DE REPARACIONES", 105, y, { align: "center" });
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Fecha: ${rec.Fecha_Ingreso || new Date().toLocaleString()}   |   N Orden: ${rec.ID_Orden}`, 105, y, { align: "center" });
      y += 4;
      doc.setDrawColor(180, 180, 180);
      doc.line(15, y, 195, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Cliente:", 15, y);
      doc.setFont("helvetica", "normal");
      doc.text(`${cleanClient}   (Tel: ${rec.Telefono || 'S/N'})`, 38, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.text("Equipo:", 15, y);
      doc.setFont("helvetica", "normal");
      doc.text(cleanEq, 38, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.text("Accesorios:", 15, y);
      doc.setFont("helvetica", "normal");
      doc.text(cleanAcc, 38, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.text("Atendido por:", 15, y);
      doc.setFont("helvetica", "normal");
      doc.text(rec.Tecnico_Responsable || "Principal", 38, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.text("Falla / Motivo:", 15, y);
      doc.setFont("helvetica", "italic");
      const splitIssue = doc.splitTextToSize(cleanIssue, 155);
      doc.text(splitIssue, 43, y);
      y += (splitIssue.length * 5) + 3;

      doc.setDrawColor(200, 200, 200);
      doc.line(15, y, 195, y);
      y += 6;

      doc.setFont("helvetica", "bold");
      doc.text(`Total: $${parseFloat(rec.Costo_Total || 0).toFixed(2)}`, 15, y);
      doc.text(`Abono: $${parseFloat(rec.Abono || 0).toFixed(2)}`, 75, y);
      doc.text(`Saldo: $${parseFloat(rec.Saldo_Pendiente || 0).toFixed(2)}`, 140, y);
      y += 8;

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Firma de Conformidad Cliente / Taller: ____________________________", 105, y + 4, { align: "center" });
    };

    // COPIA 1: CLIENTE (Mitad Superior)
    printCopy(10, "COPIA CLIENTE - COMPROBANTE DE RECEPCION");

    // LÍNEA DE CORTE CENTRAL
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(100, 100, 100);
    doc.line(10, 142, 200, 142);
    doc.setFontSize(8);
    doc.text("✂️ LINEA DE CORTE ENTREGA / TALLER ✂️", 105, 141, { align: "center" });
    doc.setLineDashPattern([], 0); // Restaurar línea sólida

    // COPIA 2: TALLER (Mitad Inferior)
    printCopy(146, "COPIA TALLER - CONTROL INTERNO");

    // SECCIÓN: 3 ETIQUETAS RECORTABLES PARA EQUIPO Y ACCESORIOS
    const stickerY = 247;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("--- ✂️ ETIQUETAS RECORTABLES PARA EQUIPO Y ACCESORIOS (3 ETIQUETAS) ✂️ ---", 105, stickerY - 2, { align: "center" });

    const stickers = [
      { label: "🏷️ 1: EQUIPO", x: 15 },
      { label: "🔌 2: CARGADOR", x: 76.5 },
      { label: "📦 3: ACCESORIOS", x: 138 }
    ];

    stickers.forEach((st) => {
      const sx = st.x;
      const sy = stickerY;
      const sw = 57;
      const sh = 38;

      // Marco punteado de recorte
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.setDrawColor(80, 80, 80);
      doc.rect(sx, sy, sw, sh);
      doc.setLineDashPattern([], 0);

      // Contenido de la etiqueta
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`COMPUKIT | ${rec.ID_Orden}`, sx + 3, sy + 5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const shortName = doc.splitTextToSize(cleanClient, sw - 6)[0] || cleanClient;
      doc.text(shortName, sx + 3, sy + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Tel: ${rec.Telefono || 'S/N'}`, sx + 3, sy + 17);

      doc.setFontSize(7.5);
      const shortEq = doc.splitTextToSize(cleanEq, sw - 6)[0] || cleanEq;
      doc.text(`Eq: ${shortEq}`, sx + 3, sy + 23);

      doc.setFontSize(7);
      doc.text(`Tec: ${rec.Tecnico_Responsable || 'Principal'}`, sx + 3, sy + 28);

      doc.setFont("helvetica", "bolditalic");
      doc.setFontSize(7.5);
      doc.text(st.label, sx + 3, sy + 34);
    });

    doc.save(`Ticket_Doble_${rec.ID_Orden}.pdf`);
  }

  escapeHTML(str) {
    return String(str || "").replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  /* ==========================================
     NOTIFICACIONES FLOTANTES (TOAST)
     ========================================== */
  showToast(message, type = "success", duration = 3200) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast-msg ${type}`;
    const formatted = this.escapeHTML(message).replace(/\n/g, "<br>");
    toast.innerHTML = `<span>${formatted}</span>`;
    
    toast.onclick = () => {
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add("toast-hide");
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  /* ==========================================
     MANTENIMIENTO, CACHÉ Y RESET LOCAL
     ========================================== */
  async clearAppCache() {
    try {
      this.showToast("🚀 Limpiando caché y actualizando archivos...", "info", 2000);
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let reg of registrations) {
          await reg.unregister();
        }
      }
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (e) {
      console.error("Error al limpiar caché:", e);
      window.location.reload();
    }
  }

  resetAppStorage() {
    const confirmReset = confirm("⚠️ ¿Estás seguro de restablecer los datos guardados en este navegador?\n\n(Tus datos en Google Sheets y Google Drive NO se borrarán).");
    if (!confirmReset) return;

    localStorage.removeItem("compukit_orders");
    localStorage.removeItem("compukit_cashflow");
    localStorage.removeItem("compukit_sync_queue");
    this.showToast("🔄 Datos locales restablecidos. Recargando...", "warning", 2000);
    setTimeout(() => {
      window.location.reload();
    }, 900);
  }
}

// Inicializar de forma completamente resiliente
function startApp() {
  if (!window.app) {
    try {
      window.app = new CompukitApp();
      window.compukit = window.app;
    } catch (e) {
      console.error("Error al instanciar CompukitApp:", e);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}



