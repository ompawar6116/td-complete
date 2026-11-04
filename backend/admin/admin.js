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
      if (activeSection === "inventory" && !carsLoadedOnce) loadCars();
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
      </tr>`
      )
      .join("");

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

  if (token) showDash();
  else showLogin();
})();
