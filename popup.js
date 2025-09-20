document.addEventListener("DOMContentLoaded", async () => {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");
  const list = document.getElementById("cookie-list");
  const modal = document.getElementById("cookie-modal");
  const closeBtn = document.querySelector(".close");
  const deleteBtn = document.getElementById("delete-cookie");

  let cookies = await chrome.cookies.getAll({});
  let filteredCookies = [...cookies];
  let currentCookie = null; // currently selected cookie

  // ---------------- Tab switching ----------------
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

  // ---------------- Render cookies ----------------
  function renderCookies(data) {
    list.innerHTML = "";
    document.getElementById("cookie-summary").textContent =
      `Total Cookies Found: ${data.length}`;

    data.forEach(cookie => {
      const size = cookie.value.length + cookie.name.length;
      const expiry = cookie.expirationDate
        ? new Date(cookie.expirationDate * 1000).toLocaleDateString()
        : "Session";

      const isFirstParty = !cookie.domain.startsWith("."); // simple first-party check

      // ---------------- Risk calculation ----------------
      let reasons = [];
      if (size > 100) reasons.push("Large size");
      if (!cookie.secure) reasons.push("Missing secure flag");
      if (!cookie.httpOnly) reasons.push("Missing HttpOnly flag");
      if (cookie.expirationDate && (cookie.expirationDate * 1000 - Date.now()) > 365*24*60*60*1000)
        reasons.push("Expires in more than 1 year");
      if (!isFirstParty) reasons.push("Third-party cookie → potential tracking");

      // ---------------- Determine risk level ----------------
      let riskLevel = "Low";
      let riskClass = "risk-low";

      if (!isFirstParty && (reasons.includes("Missing secure flag") || reasons.includes("Missing HttpOnly flag"))) {
        riskLevel = "High"; riskClass = "risk-high";
      } else if (!isFirstParty && reasons.length > 0) {
        riskLevel = "Medium"; riskClass = "risk-medium";
      } else if (isFirstParty && (reasons.includes("Missing secure flag") || reasons.includes("Missing HttpOnly flag"))) {
        riskLevel = "High (Essential)"; riskClass = "risk-high";
        reasons.push("First-party essential cookie → do NOT delete unless you understand the risk");
      } else if (reasons.length > 0) {
        riskLevel = "Medium"; riskClass = "risk-medium";
      }

      const reasonText = reasons.length > 0 ? reasons.join("; ") : "Cookie size & expiry are within safe limits.";

      // ---------------- Render cookie card ----------------
      const card = document.createElement("div");
      card.className = "cookie-card";
      card.innerHTML = `
        <div class="cookie-header">
          <span>${cookie.name}</span>
          <span class="risk-score ${riskClass}">${riskLevel}</span>
        </div>
        <div class="cookie-meta">
          Size: ${size} bytes • Expiry: ${expiry}
        </div>
      `;

      card.addEventListener("click", () =>
        openModal(cookie, size, expiry, riskLevel, reasonText)
      );

      list.appendChild(card);
    });
  }

  renderCookies(filteredCookies);

  // ---------------- Filters ----------------
  document.getElementById("search").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    filteredCookies = cookies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.domain.toLowerCase().includes(q)
    );
    renderCookies(filteredCookies);
  });

  document.getElementById("filter-risk").addEventListener("change", e => {
    const val = e.target.value;
    filteredCookies = cookies.filter(c => {
      const size = c.value.length + c.name.length;
      let risk = "Low";
      const isFirstParty = !c.domain.startsWith(".");
      let reasons = [];
      if (size > 100) reasons.push("Large size");
      if (!c.secure) reasons.push("Missing secure flag");
      if (!c.httpOnly) reasons.push("Missing HttpOnly flag");
      if (!isFirstParty && (reasons.includes("Missing secure flag") || reasons.includes("Missing HttpOnly flag"))) risk = "High";
      else if (!isFirstParty && reasons.length > 0) risk = "Medium";
      else if (isFirstParty && (reasons.includes("Missing secure flag") || reasons.includes("Missing HttpOnly flag"))) risk = "High (Essential)";
      else if (reasons.length > 0) risk = "Medium";
      return val === "all" || risk === val;
    });
    renderCookies(filteredCookies);
  });

  document.getElementById("filter-expiry").addEventListener("change", e => {
    const val = e.target.value;
    const now = Date.now();
    filteredCookies = cookies.filter(c => {
      if (val === "session") return !c.expirationDate;
      if (val === "soon") return c.expirationDate && (c.expirationDate * 1000 - now) < 7 * 24 * 60 * 60 * 1000;
      if (val === "long") return c.expirationDate && (c.expirationDate * 1000 - now) > 90 * 24 * 60 * 60 * 1000;
      return true;
    });
    renderCookies(filteredCookies);
  });

  // ---------------- Modal logic ----------------
  function openModal(cookie, size, expiry, risk, reason) {
    currentCookie = cookie;
    document.getElementById("modal-name").textContent = cookie.name;
    document.getElementById("modal-domain").textContent = cookie.domain;
    document.getElementById("modal-size").textContent = size + " bytes";
    document.getElementById("modal-expiry").textContent = expiry;
    document.getElementById("modal-risk").textContent = risk;
    document.getElementById("modal-reason").textContent = reason;
    document.getElementById("modal-delete").textContent =
      (risk.includes("High")) ? "Yes, recommended to delete." : "No, safe to keep.";
    modal.style.display = "block";
  }

  closeBtn.onclick = () => modal.style.display = "none";
  window.onclick = e => { if (e.target === modal) modal.style.display = "none"; };

  // ---------------- Delete button ----------------
  deleteBtn.addEventListener("click", async () => {
    if (!currentCookie) return;
    try {
      await chrome.cookies.remove({
        url: (currentCookie.secure ? "https://" : "http://") +
             currentCookie.domain + currentCookie.path,
        name: currentCookie.name
      });
      alert(`✅ Cookie "${currentCookie.name}" deleted successfully!`);
      modal.style.display = "none";

      // Refresh list
      cookies = await chrome.cookies.getAll({});
      filteredCookies = [...cookies];
      renderCookies(filteredCookies);
    } catch (err) {
      alert("❌ Failed to delete cookie: " + err.message);
    }
  });

});
