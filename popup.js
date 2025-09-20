// ---------------- Global Variables ----------------
let cookies = [];
let filteredCookies = [];   // ✅ now global
let currentCookie = null;

document.addEventListener("DOMContentLoaded", async () => {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");
  const list = document.getElementById("cookie-list");
  const modal = document.getElementById("cookie-modal");
  const closeBtn = document.querySelector(".close");
  const deleteBtn = document.getElementById("delete-cookie");

  // ---------------- Load Cookies ----------------
  cookies = await chrome.cookies.getAll({});
  filteredCookies = [...cookies];  // ✅ assign to global
  renderCookies(filteredCookies);

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

      const isFirstParty = !cookie.domain.startsWith(".");
      let reasons = [];
      if (size > 100) reasons.push("Large size");
      if (!cookie.secure) reasons.push("Missing secure flag");
      if (!cookie.httpOnly) reasons.push("Missing HttpOnly flag");
      if (cookie.expirationDate && (cookie.expirationDate * 1000 - Date.now()) > 365*24*60*60*1000)
        reasons.push("Expires in more than 1 year");
      if (!isFirstParty) reasons.push("Third-party cookie → potential tracking");

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

    renderChart(data);
  }

  // ---------------- Chart.js ----------------
  function renderChart(data) {
    let high = 0, medium = 0, low = 0;

    data.forEach(cookie => {
      const size = cookie.value.length + cookie.name.length;
      const isFirstParty = !cookie.domain.startsWith(".");
      let reasons = [];
      if (size > 100) reasons.push("Large size");
      if (!cookie.secure) reasons.push("Missing secure flag");
      if (!cookie.httpOnly) reasons.push("Missing HttpOnly flag");

      if (!isFirstParty && (reasons.includes("Missing secure flag") || reasons.includes("Missing HttpOnly flag"))) {
        high++;
      } else if (!isFirstParty && reasons.length > 0) {
        medium++;
      } else if (isFirstParty && (reasons.includes("Missing secure flag") || reasons.includes("Missing HttpOnly flag"))) {
        high++;
      } else if (reasons.length > 0) {
        medium++;
      } else {
        low++;
      }
    });

    const ctx = document.getElementById('riskChart').getContext('2d');
    if (window.riskChartInstance) window.riskChartInstance.destroy();

    // ✅ Chart is now defined because we load chart.umd.min.js locally
    window.riskChartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['High Risk', 'Medium Risk', 'Low Risk'],
        datasets: [{ data: [high, medium, low], backgroundColor: ['#c5221f', '#b26a00', '#137333'] }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

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
      const isFirstParty = !c.domain.startsWith(".");
      let reasons = [];
      if (size > 100) reasons.push("Large size");
      if (!c.secure) reasons.push("Missing secure flag");
      if (!c.httpOnly) reasons.push("Missing HttpOnly flag");

      let risk = "Low";
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

  // ---------------- Modal ----------------
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

  // ---------------- Delete ----------------
  deleteBtn.addEventListener("click", async () => {
    if (!currentCookie) return;
    try {
      await chrome.cookies.remove({
        url: (currentCookie.secure ? "https://" : "http://") + currentCookie.domain + currentCookie.path,
        name: currentCookie.name
      });
      alert(`✅ Cookie "${currentCookie.name}" deleted successfully!`);
      modal.style.display = "none";
      cookies = await chrome.cookies.getAll({});
      filteredCookies = [...cookies];
      renderCookies(filteredCookies);
    } catch (err) {
      alert("❌ Failed to delete cookie: " + err.message);
    }
  });

  // ---------------- Export CSV ----------------
  document.getElementById("export-csv").addEventListener("click", () => {
    if (!filteredCookies || filteredCookies.length === 0) return alert("No cookies to export.");
    const header = ["Name", "Domain", "Value", "Size(bytes)", "Expiry", "Risk"];
    const rows = filteredCookies.map(c => {
      const size = c.value.length + c.name.length;
      const expiry = c.expirationDate ? new Date(c.expirationDate * 1000).toLocaleString() : "Session";
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
      return [c.name, c.domain, c.value, size, expiry, risk].map(v => `"${v}"`).join(",");
    });
    const csvContent = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cookie_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---------------- Export PDF ----------------
  document.getElementById("export-pdf").addEventListener("click", () => {
    if (!filteredCookies || filteredCookies.length === 0) return alert("No cookies to export.");
    const { jsPDF } = window.jspdf;  // ✅ works now because we load jspdf.umd.min.js locally
    const doc = new jsPDF();
    let y = 10;
    doc.setFontSize(14);
    doc.text("Cookie Risk Report", 10, y);
    y += 10;
    filteredCookies.forEach(c => {
      const size = c.value.length + c.name.length;
      const expiry = c.expirationDate ? new Date(c.expirationDate * 1000).toLocaleString() : "Session";
      doc.setFontSize(11);
      doc.text(`Name: ${c.name}`, 10, y); y += 6;
      doc.text(`Domain: ${c.domain}`, 10, y); y += 6;
      doc.text(`Size: ${size} bytes`, 10, y); y += 6;
      doc.text(`Expiry: ${expiry}`, 10, y); y += 6;
      doc.text("------------", 10, y); y += 6;
    });
    doc.save("cookie_report.pdf");
  });

});
