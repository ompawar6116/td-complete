(function () {
  "use strict";

  const STATUSES = ["New", "Contacted", "Follow-up", "Converted", "Closed"];
  let apiBase = localStorage.getItem("tdAdminApiBase") || "http://localhost:4000";
  let token = sessionStorage.getItem("tdAdminToken") || "";
  let inquiries = [];
  let activeStatus = "All";

  const loginScreen = document.getElementById("loginScreen");
  const dash = document.getElementById("dash");
  const loginForm = document.getElementById("loginForm");
  const loginErr = document.getElementById("loginErr");
  const apiBaseInput = document.getElementById("apiBaseInput");

  apiBaseInput.value = apiBase;

  async function api(path, opts = {}) {
    const res = await fetch(apiBase.replace(/\/$/, "") + path, {
      ...opts,
      headers: {
        // Let the browser set the multipart boundary itself for file uploads.
        ...(opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        Authorization: "Bearer " + token,
        ...(opts.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      sessionStorage.removeItem("tdAdminToken");
      token = "";
      showLogin(data.error || "Session expired. Please log in again.");
      throw new Error(data.error || "Unauthorized.");
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function showDash() {
    loginScreen.hidden = true;
    dash.hidden = false;
    load();
  }
  function showLogin(err) {
    dash.hidden = true;
    loginScreen.hidden = false;
    loginErr.textContent = err || "";
  }

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    apiBase = apiBaseInput.value.trim() || "http://localhost:4000";
    localStorage.setItem("tdAdminApiBase", apiBase);
    const password = document.getElementById("loginPassword").value;
    loginErr.textContent = "Checking…";
    try {
      const res = await fetch(apiBase.replace(/\/$/, "") + "/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed.");
      token = data.token;
      sessionStorage.setItem("tdAdminToken", token);
      showDash();
    } catch (err) {
      loginErr.textContent = /fetch/i.test(err.message)
        ? "Can't reach the API — check the base URL and that the server is running."
        : err.message;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("tdAdminToken");
    token = "";
    showLogin();
  });
  document.getElementById("refreshBtn").addEventListener("click", () => {
    if (activeSection === "inventory") loadCars();
    else if (activeSection === "parts") loadParts();
    else load();
  });

  // ---- Section tabs (Inquiries / Inventory) ----
  let activeSection = "inquiries";
  document.querySelectorAll(".section-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      activeSection = tab.dataset.section;
      document.querySelectorAll(".section-tab").forEach(t => t.classList.toggle("is-active", t === tab));
      document.getElementById("panelInquiries").hidden = activeSection !== "inquiries";
      document.getElementById("panelInventory").hidden = activeSection !== "inventory";
      document.getElementById("panelParts").hidden = activeSection !== "parts";
      document.getElementById("statRow").hidden = activeSection !== "inquiries"; // inquiry counts only belong on the Inquiries tab
      if (activeSection === "inventory" && !carsLoadedOnce) loadCars();
      if (activeSection === "parts" && !partsLoadedOnce) loadParts();
    });
  });

  async function load() {
    try {
      const data = await api("/api/inquiries");
      inquiries = data.inquiries || [];
      renderStats();
      renderFilters();
      renderRows();
      document.getElementById("dashSub").textContent =
        `${inquiries.length} inquiries · connected to ${apiBase}`;
    } catch (err) {
      showLogin(err.message);
    }
  }

  function renderStats() {
    const row = document.getElementById("statRow");
    const counts = { All: inquiries.length };
    STATUSES.forEach(s => (counts[s] = inquiries.filter(i => i.status === s).length));
    row.innerHTML = ["All", ...STATUSES]
      .map(s => `<div class="stat-box"><span class="n">${counts[s] || 0}</span><span class="l">${s}</span></div>`)
      .join("");
  }

  function renderFilters() {
    const el = document.getElementById("statusFilters");
    el.innerHTML = ["All", ...STATUSES]
      .map(s => `<button class="chip${s === activeStatus ? " is-active" : ""}" data-status="${s}">${s}</button>`)
      .join("");
    el.querySelectorAll(".chip").forEach(btn =>
      btn.addEventListener("click", () => {
        activeStatus = btn.dataset.status;
        renderFilters();
        renderRows();
      })
    );
  }

  function renderRows() {
    const tbody = document.getElementById("rows");
    const empty = document.getElementById("emptyState");
    const list = inquiries.filter(i => activeStatus === "All" || i.status === activeStatus);

    if (!list.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    tbody.innerHTML = list
      .map(
        i => `
      <tr data-id="${i.id}">
        <td class="cell-sub">${new Date(i.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
        <td class="cell-name">${escapeHtml(i.name)}</td>
        <td>${escapeHtml(i.phone)}<div class="cell-sub">${escapeHtml(i.email)}</div></td>
        <td>${escapeHtml(i.brand || "—")}<div class="cell-sub">${escapeHtml(i.model || "")}</div></td>
        <td>${escapeHtml(i.service)}</td>
        <td class="msg-cell">${escapeHtml(i.message || "—")}</td>
        <td>
          <select class="status-select" data-id="${i.id}">
            ${STATUSES.map(s => `<option value="${s}" ${s === i.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td><button class="btn btn-ghost btn-sm" data-reply="${i.id}">Reply</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-reply]").forEach(btn => {
      btn.addEventListener("click", () => openReply(inquiries.find(x => x.id === btn.dataset.reply)));
    });

    tbody.querySelectorAll(".status-select").forEach(sel => {
      sel.addEventListener("change", async () => {
        const id = sel.dataset.id;
        const status = sel.value;
        try {
          await api(`/api/inquiries/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
          const item = inquiries.find(x => x.id === id);
          if (item) item.status = status;
          renderStats();
        } catch (err) {
          alert("Couldn't update status: " + err.message);
        }
      });
    });
  }

  // Photos are stored by the API as "/uploads/..." — make them loadable from here.
  function imgSrc(url) {
    if (!url) return "";
    return /^(https?:|data:)/.test(url) ? url : apiBase.replace(/\/$/, "") + url;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ============================================================
  // INVENTORY (cars) management
  // ============================================================
  let cars = [];
  let carsLoadedOnce = false;
  let editingCarId = null;

  const carModalOverlay = document.getElementById("carModalOverlay");
  const carForm = document.getElementById("carForm");
  const carFormErr = document.getElementById("carFormErr");

  async function loadCars() {
    try {
      const data = await api("/api/cars?all=1");
      cars = data.cars || [];
      carsLoadedOnce = true;
      renderCarRows();
    } catch (err) {
      alert("Couldn't load inventory: " + err.message);
    }
  }

  function renderCarRows() {
    const tbody = document.getElementById("carRows");
    const empty = document.getElementById("carEmptyState");
    if (!cars.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    tbody.innerHTML = cars.map(c => `
      <tr data-id="${c.id}">
        <td class="cell-name"><div class="car-cell">${c.imageUrl ? `<img class="car-thumb" src="${escapeHtml(imgSrc(c.imageUrl))}" alt="">` : `<span class="car-thumb car-thumb-empty" title="No photo yet">No photo</span>`}<div>${escapeHtml(c.brand)} ${escapeHtml(c.name)}<div class="cell-sub">${escapeHtml(c.id)}</div></div></div></td>
        <td>${escapeHtml(c.category)}</td>
        <td>${escapeHtml(c.price)}</td>
        <td>${escapeHtml(c.condition)}</td>
        <td><button class="stock-toggle ${c.inStock ? "is-in" : "is-out"}" data-toggle-stock="${c.id}">${c.inStock ? "In Stock" : "Out of Stock"}</button></td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit-car="${c.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-car="${c.id}">Delete</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-toggle-stock]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.toggleStock;
        const car = cars.find(c => c.id === id);
        try {
          await api(`/api/cars/${id}/stock`, { method: "PATCH", body: JSON.stringify({ inStock: !car.inStock }) });
          car.inStock = !car.inStock;
          renderCarRows();
        } catch (err) {
          alert("Couldn't update stock status: " + err.message);
        }
      });
    });
    tbody.querySelectorAll("[data-edit-car]").forEach(btn => {
      btn.addEventListener("click", () => openCarForm(cars.find(c => c.id === btn.dataset.editCar)));
    });
    tbody.querySelectorAll("[data-delete-car]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.deleteCar;
        const car = cars.find(c => c.id === id);
        if (!confirm(`Delete ${car.brand} ${car.name}? This can't be undone.`)) return;
        try {
          await api(`/api/cars/${id}`, { method: "DELETE" });
          cars = cars.filter(c => c.id !== id);
          renderCarRows();
        } catch (err) {
          alert("Couldn't delete car: " + err.message);
        }
      });
    });
  }

  function openCarForm(car) {
    editingCarId = car ? car.id : null;
    document.getElementById("carFormTitle").textContent = car ? "Edit Car" : "Add Car";
    document.getElementById("cf_brand").value = car ? car.brand : "";
    document.getElementById("cf_name").value = car ? car.name : "";
    document.getElementById("cf_category").value = car ? car.category : "SUV";
    document.getElementById("cf_condition").value = car ? car.condition : "New";
    document.getElementById("cf_price").value = car ? car.price : "";
    document.getElementById("cf_fuel").value = car ? car.fuel : "";
    document.getElementById("cf_transmission").value = car ? car.transmission : "";
    document.getElementById("cf_engine").value = car ? car.engine : "";
    document.getElementById("cf_mileage").value = car ? car.mileage : "";
    document.getElementById("cf_seating").value = car ? car.seating : "";
    document.getElementById("cf_safety").value = car ? car.safety : "";
    document.getElementById("cf_desc").value = car ? car.desc : "";
    document.getElementById("cf_imageUrl").value = car && /^https?:/.test(car.imageUrl || "") ? car.imageUrl : "";
    document.getElementById("cf_photo").value = "";
    pendingRemovePhoto = false;
    currentPhoto = car ? (car.imageUrl || "") : "";
    renderPhotoPreview();
    document.getElementById("cf_highlights").value = car ? (car.highlights || []).join(", ") : "";
    carFormErr.textContent = "";
    carModalOverlay.hidden = false;
  }
  let pendingRemovePhoto = false;
  let currentPhoto = "";
  const photoPreview = document.getElementById("photoPreview");
  const photoInput = document.getElementById("cf_photo");
  const photoRemove = document.getElementById("photoRemove");
  function renderPhotoPreview(localFile) {
    const src = localFile ? URL.createObjectURL(localFile) : (pendingRemovePhoto ? "" : imgSrc(currentPhoto));
    photoPreview.innerHTML = src ? `<img src="${escapeHtml(src)}" alt="Car photo preview">` : `<span>No photo</span>`;
    photoRemove.hidden = !(localFile || (currentPhoto && !pendingRemovePhoto));
  }
  photoInput.addEventListener("change", () => {
    const f = photoInput.files[0];
    if (f && f.size > 5 * 1024 * 1024) { carFormErr.textContent = "That image is over 5 MB. Please choose a smaller one."; photoInput.value = ""; renderPhotoPreview(); return; }
    carFormErr.textContent = "";
    pendingRemovePhoto = false;
    renderPhotoPreview(f);
  });
  photoRemove.addEventListener("click", () => {
    photoInput.value = "";
    pendingRemovePhoto = !!currentPhoto;
    renderPhotoPreview();
  });

  function closeCarForm() {
    carModalOverlay.hidden = true;
    editingCarId = null;
  }

  document.getElementById("addCarBtn").addEventListener("click", () => openCarForm(null));
  document.getElementById("carFormCancel").addEventListener("click", closeCarForm);
  carModalOverlay.addEventListener("click", e => { if (e.target === carModalOverlay) closeCarForm(); });

  carForm.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = {
      brand: document.getElementById("cf_brand").value.trim(),
      name: document.getElementById("cf_name").value.trim(),
      category: document.getElementById("cf_category").value,
      condition: document.getElementById("cf_condition").value,
      price: document.getElementById("cf_price").value.trim(),
      fuel: document.getElementById("cf_fuel").value.trim(),
      transmission: document.getElementById("cf_transmission").value.trim(),
      engine: document.getElementById("cf_engine").value.trim(),
      mileage: document.getElementById("cf_mileage").value.trim(),
      seating: document.getElementById("cf_seating").value.trim(),
      safety: document.getElementById("cf_safety").value.trim(),
      desc: document.getElementById("cf_desc").value.trim(),
      // Keep an already-uploaded photo unless it is being removed or replaced by a pasted URL.
      imageUrl: document.getElementById("cf_imageUrl").value.trim() ||
        (!pendingRemovePhoto && /^\/uploads\//.test(currentPhoto) ? currentPhoto : ""),
      highlights: document.getElementById("cf_highlights").value.split(",").map(s => s.trim()).filter(Boolean)
    };
    carFormErr.textContent = "Saving…";
    try {
      let saved;
      if (editingCarId) {
        const data = await api(`/api/cars/${editingCarId}`, { method: "PUT", body: JSON.stringify(payload) });
        saved = data.car;
      } else {
        const data = await api("/api/cars", { method: "POST", body: JSON.stringify(payload) });
        saved = data.car;
      }
      // Photo: upload a newly chosen file, or remove the existing one.
      const file = photoInput.files[0];
      try {
        if (file) {
          const fd = new FormData();
          fd.append("image", file);
          saved = (await api(`/api/cars/${saved.id}/image`, { method: "POST", body: fd })).car;
        } else if (pendingRemovePhoto) {
          saved = (await api(`/api/cars/${saved.id}/image`, { method: "DELETE" })).car;
        }
      } catch (photoErr) {
        // The car itself is saved; tell the user the photo step failed.
        const i2 = cars.findIndex(c => c.id === saved.id);
        if (i2 !== -1) cars[i2] = saved; else cars.unshift(saved);
        renderCarRows();
        editingCarId = saved.id;
        carFormErr.textContent = "Car saved, but the photo failed: " + photoErr.message;
        return;
      }
      const idx = cars.findIndex(c => c.id === saved.id);
      if (idx !== -1) cars[idx] = saved; else cars.unshift(saved);
      renderCarRows();
      closeCarForm();
    } catch (err) {
      carFormErr.textContent = err.message;
    }
  });

  // ============================================================
  // REPLY TO AN INQUIRY (the reply is emailed to the customer)
  // ============================================================
  const replyOverlay = document.getElementById("replyModalOverlay");
  const replyForm = document.getElementById("replyForm");
  const replyErr = document.getElementById("replyErr");
  const replyMessage = document.getElementById("replyMessage");
  const replySubmit = document.getElementById("replySubmit");
  let replyingTo = null;

  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.classList.toggle("form-ok", kind === "ok");
    el.classList.toggle("form-warn", kind === "warn");
  }

  function openReply(inq) {
    if (!inq) return;
    replyingTo = inq;
    document.getElementById("replyMeta").innerHTML =
      `<div><strong>${escapeHtml(inq.name)}</strong> · ${escapeHtml(inq.email)} · ${escapeHtml(inq.phone)}</div>` +
      `<div>${escapeHtml(inq.service)}${inq.brand ? " · " + escapeHtml(inq.brand) : ""}${inq.model ? " " + escapeHtml(inq.model) : ""}</div>` +
      (inq.message ? `<div class="quote">${escapeHtml(inq.message)}</div>` : "");
    document.getElementById("replyHint").textContent = `(will be emailed to ${inq.email})`;
    replyMessage.value = "";
    setMsg(replyErr, "");
    replySubmit.disabled = false;
    document.getElementById("replyHistory").hidden = true;
    replyOverlay.hidden = false;
    replyMessage.focus();
    loadReplyHistory(inq.id);
  }
  function closeReply() { replyOverlay.hidden = true; replyingTo = null; }

  async function loadReplyHistory(id) {
    try {
      const data = await api(`/api/inquiries/${id}/replies`);
      if (!replyingTo || replyingTo.id !== id) return;
      const list = data.replies || [];
      document.getElementById("replyHistory").hidden = !list.length;
      document.getElementById("replyHistoryList").innerHTML = list.map(r => {
        const label = r.emailStatus === "sent" ? "emailed" : r.emailStatus === "failed" ? "email failed" : "not emailed (SMTP not set up)";
        return `<div class="reply-item"><span class="when">${new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}<span class="tag ${escapeHtml(r.emailStatus)}">${label}</span></span>${escapeHtml(r.message)}</div>`;
      }).join("");
    } catch (err) { /* history is optional; the reply form still works */ }
  }

  document.getElementById("replyCancel").addEventListener("click", closeReply);
  replyOverlay.addEventListener("click", e => { if (e.target === replyOverlay) closeReply(); });

  replyForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!replyingTo) return;
    const target = replyingTo;
    replySubmit.disabled = true;
    setMsg(replyErr, "Sending…");
    try {
      const data = await api(`/api/inquiries/${target.id}/reply`, { method: "POST", body: JSON.stringify({ message: replyMessage.value }) });
      const item = inquiries.find(x => x.id === target.id);
      if (item && data.inquiry) item.status = data.inquiry.status;
      renderStats();
      renderRows();
      replyMessage.value = "";
      if (data.email && data.email.sent) {
        setMsg(replyErr, `Reply emailed to ${target.email}.`, "ok");
      } else {
        const why = data.email && data.email.reason ? data.email.reason : "unknown reason";
        setMsg(replyErr, `Reply saved, but the email was NOT sent (${why}). Check the SMTP settings in .env.`, "warn");
      }
      loadReplyHistory(target.id);
    } catch (err) {
      setMsg(replyErr, err.message);
    } finally {
      replySubmit.disabled = false;
    }
  });

  // ============================================================
  // SPARE PARTS stock management
  // ============================================================
  let parts = [];
  let partSummary = null;
  let partCategories = [];
  let partsLoadedOnce = false;
  let editingPartId = null;
  let partStatusFilter = "All";
  const PART_STATUSES = ["All", "In Stock", "Low Stock", "Out of Stock"];

  const partModalOverlay = document.getElementById("partModalOverlay");
  const partForm = document.getElementById("partForm");
  const partFormErr = document.getElementById("partFormErr");
  const partSearch = document.getElementById("partSearch");
  const partCategoryFilter = document.getElementById("partCategoryFilter");

  const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const badgeClass = st => st === "In Stock" ? "is-in" : st === "Low Stock" ? "is-low" : "is-out";

  async function loadParts() {
    try {
      const data = await api("/api/spare-parts");
      parts = data.parts || [];
      partSummary = data.summary || null;
      partCategories = data.categories || [];
      partsLoadedOnce = true;
      fillCategorySelects();
      renderParts();
    } catch (err) {
      alert("Couldn't load spare parts: " + err.message);
    }
  }

  function fillCategorySelects() {
    const current = partCategoryFilter.value || "All";
    partCategoryFilter.innerHTML = `<option value="All">All categories</option>` +
      partCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    partCategoryFilter.value = partCategories.includes(current) ? current : "All";
    document.getElementById("pf_category").innerHTML =
      partCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  // The summary is recomputed in the browser after every change so the cards
  // always match the table without another round-trip.
  function computeSummary() {
    const s = { totalParts: parts.length, totalUnits: 0, inStock: 0, lowStock: 0, outOfStock: 0, stockValue: 0 };
    parts.forEach(p => {
      s.totalUnits += p.quantity;
      s.stockValue += p.quantity * p.price;
      if (p.status === "In Stock") s.inStock++;
      else if (p.status === "Low Stock") s.lowStock++;
      else s.outOfStock++;
    });
    return s;
  }

  function renderPartStats() {
    const s = computeSummary();
    document.getElementById("partStats").innerHTML = [
      ["Total parts", s.totalParts, ""],
      ["Units in stock", s.totalUnits, ""],
      ["In stock", s.inStock, "is-good"],
      ["Low stock", s.lowStock, "is-warn"],
      ["Out of stock", s.outOfStock, "is-bad"],
      ["Stock value", inr(s.stockValue), ""]
    ].map(([l, n, cls]) => `<div class="stat-box ${cls}"><span class="n">${n}</span><span class="l">${l}</span></div>`).join("");
  }

  function renderPartFilters() {
    const el = document.getElementById("partStatusFilters");
    const counts = { All: parts.length };
    PART_STATUSES.slice(1).forEach(st => (counts[st] = parts.filter(p => p.status === st).length));
    el.innerHTML = PART_STATUSES.map(st =>
      `<button class="chip${st === partStatusFilter ? " is-active" : ""}" data-pstatus="${st}">${st} (${counts[st]})</button>`).join("");
    el.querySelectorAll(".chip").forEach(btn => btn.addEventListener("click", () => {
      partStatusFilter = btn.dataset.pstatus;
      renderParts();
    }));
  }

  function renderParts() {
    renderPartStats();
    renderPartFilters();
    const q = partSearch.value.trim().toLowerCase();
    const cat = partCategoryFilter.value;
    const list = parts.filter(p =>
      (partStatusFilter === "All" || p.status === partStatusFilter) &&
      (cat === "All" || p.category === cat) &&
      (!q || [p.name, p.partNumber, p.brand, p.compatibleWith].some(v => String(v || "").toLowerCase().includes(q)))
    );
    const tbody = document.getElementById("partRows");
    const empty = document.getElementById("partEmptyState");
    if (!list.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
      empty.textContent = parts.length ? "No parts match your search or filters." : "No spare parts yet — click “+ Add Part” to add your first one.";
      return;
    }
    empty.hidden = true;
    tbody.innerHTML = list.map(p => `
      <tr data-id="${p.id}">
        <td class="cell-name">${escapeHtml(p.name)}<div class="cell-sub">${escapeHtml(p.partNumber)}${p.brand ? " · " + escapeHtml(p.brand) : ""}</div></td>
        <td>${escapeHtml(p.category)}</td>
        <td class="msg-cell">${escapeHtml(p.compatibleWith || "—")}</td>
        <td>${inr(p.price)}</td>
        <td><span class="qty-ctl">
          <button class="qty-btn" data-qty-dec="${p.id}" ${p.quantity <= 0 ? "disabled" : ""} aria-label="Decrease quantity">−</button>
          <span class="qty">${p.quantity}</span>
          <button class="qty-btn" data-qty-inc="${p.id}" aria-label="Increase quantity">+</button>
        </span><div class="cell-sub">warn at ≤ ${p.lowStockThreshold}</div></td>
        <td><span class="status-badge ${badgeClass(p.status)}">${p.status}</span></td>
        <td class="row-actions">
          <button class="btn btn-ghost btn-sm" data-edit-part="${p.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-part="${p.id}">Delete</button>
        </td>
      </tr>`).join("");

    const changeQty = async (id, delta) => {
      const part = parts.find(x => x.id === id);
      if (!part) return;
      const next = Math.max(0, part.quantity + delta);
      try {
        const data = await api(`/api/spare-parts/${id}/quantity`, { method: "PATCH", body: JSON.stringify({ quantity: next }) });
        Object.assign(part, data.part);
        renderParts();
      } catch (err) {
        alert("Couldn't update quantity: " + err.message);
      }
    };
    tbody.querySelectorAll("[data-qty-dec]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.qtyDec, -1)));
    tbody.querySelectorAll("[data-qty-inc]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.qtyInc, 1)));
    tbody.querySelectorAll("[data-edit-part]").forEach(b =>
      b.addEventListener("click", () => openPartForm(parts.find(x => x.id === b.dataset.editPart))));
    tbody.querySelectorAll("[data-delete-part]").forEach(b => b.addEventListener("click", async () => {
      const part = parts.find(x => x.id === b.dataset.deletePart);
      if (!part || !confirm(`Delete ${part.name} (${part.partNumber})? This can't be undone.`)) return;
      try {
        await api(`/api/spare-parts/${part.id}`, { method: "DELETE" });
        parts = parts.filter(x => x.id !== part.id);
        renderParts();
      } catch (err) {
        alert("Couldn't delete part: " + err.message);
      }
    }));
  }

  partSearch.addEventListener("input", renderParts);
  partCategoryFilter.addEventListener("change", renderParts);

  function openPartForm(part) {
    editingPartId = part ? part.id : null;
    document.getElementById("partFormTitle").textContent = part ? "Edit Spare Part" : "Add Spare Part";
    document.getElementById("pf_name").value = part ? part.name : "";
    document.getElementById("pf_partNumber").value = part ? part.partNumber : "";
    document.getElementById("pf_category").value = part ? part.category : (partCategories[0] || "");
    document.getElementById("pf_brand").value = part ? part.brand : "";
    document.getElementById("pf_compatibleWith").value = part ? part.compatibleWith : "";
    document.getElementById("pf_price").value = part ? part.price : "";
    document.getElementById("pf_quantity").value = part ? part.quantity : "";
    document.getElementById("pf_lowStockThreshold").value = part ? part.lowStockThreshold : 5;
    document.getElementById("pf_description").value = part ? part.description : "";
    partFormErr.textContent = "";
    partModalOverlay.hidden = false;
  }
  function closePartForm() { partModalOverlay.hidden = true; editingPartId = null; }

  document.getElementById("addPartBtn").addEventListener("click", async () => {
    if (!partCategories.length) await loadParts(); // categories come from the API
    openPartForm(null);
  });
  document.getElementById("partFormCancel").addEventListener("click", closePartForm);
  partModalOverlay.addEventListener("click", e => { if (e.target === partModalOverlay) closePartForm(); });

  partForm.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = {
      name: document.getElementById("pf_name").value.trim(),
      partNumber: document.getElementById("pf_partNumber").value.trim(),
      category: document.getElementById("pf_category").value,
      brand: document.getElementById("pf_brand").value.trim(),
      compatibleWith: document.getElementById("pf_compatibleWith").value.trim(),
      price: document.getElementById("pf_price").value,
      quantity: document.getElementById("pf_quantity").value,
      lowStockThreshold: document.getElementById("pf_lowStockThreshold").value,
      description: document.getElementById("pf_description").value.trim()
    };
    partFormErr.textContent = "Saving…";
    try {
      const data = editingPartId
        ? await api(`/api/spare-parts/${editingPartId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api("/api/spare-parts", { method: "POST", body: JSON.stringify(payload) });
      const idx = parts.findIndex(x => x.id === data.part.id);
      if (idx !== -1) parts[idx] = data.part; else parts.push(data.part);
      parts.sort((a, b) => a.name.localeCompare(b.name));
      renderParts();
      closePartForm();
    } catch (err) {
      partFormErr.textContent = err.message;
    }
  });

  if (token) showDash();
  else showLogin();
})();
