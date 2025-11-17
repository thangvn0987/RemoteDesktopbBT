(function () {
  console.log("Controller Dashboard loaded");

  // DOM Elements
  const profileMenuBtn = document.getElementById("profile-menu");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const addHostBtn = document.getElementById("add-host-btn");
  const addHostModal = document.getElementById("add-host-modal");
  const closeModalBtn = document.getElementById("close-modal");
  const cancelBtn = document.getElementById("cancel-btn");
  const addHostForm = document.getElementById("add-host-form");
  const hostsGrid = document.getElementById("hosts-grid");
  const emptyState = document.getElementById("empty-state");

  // Profile Menu Toggle
  profileMenuBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    dropdownMenu.classList.toggle("show");
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", function () {
    dropdownMenu.classList.remove("show");
  });

  // Profile Menu Actions
  document
    .getElementById("switch-role")
    .addEventListener("click", function (e) {
      e.preventDefault();
      console.log("Switch to Host Mode clicked");
      // TODO: Implement role switching
      alert("Switch to Host Mode - Coming Soon!");
    });

  document.getElementById("settings").addEventListener("click", function (e) {
    e.preventDefault();
    console.log("Settings clicked");
    // TODO: Open settings modal
    alert("Settings - Coming Soon!");
  });

  document.getElementById("logout").addEventListener("click", function (e) {
    e.preventDefault();
    console.log("Logout clicked");
    // Implement logout
    if (confirm("Are you sure you want to logout?")) {
      const token = localStorage.getItem("auth_token");
      // Fire and forget logout API
      if (token) {
        fetch(`${APP_CONFIG.AUTH_BASE}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      localStorage.removeItem("auth_token");
      window.location.href = "/login/login.html";
    }
  });

  // Add Host Modal
  addHostBtn.addEventListener("click", function () {
    console.log("Add Host button clicked");
    showModal();
  });

  closeModalBtn.addEventListener("click", function () {
    hideModal();
  });

  cancelBtn.addEventListener("click", function () {
    hideModal();
  });

  // Close modal when clicking outside
  addHostModal.addEventListener("click", function (e) {
    if (e.target === addHostModal) {
      hideModal();
    }
  });

  // Add Host Form
  addHostForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("host-email").value;
    const message = document.getElementById("host-message").value;

    console.log("Adding new host:", { email, message });

    // Clear previous inline error
    const errorBox = document.getElementById("add-host-error");
    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${APP_CONFIG.AUTH_BASE}/api/hosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, message }),
      });

      let data;
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }

      if (!response.ok) {
        const backendErrRaw = data && (data.error || data.message);
        const backendErr = translateBackendError(backendErrRaw);

        // Special case: relationship already exists -> show pending list
        if (
          backendErrRaw &&
          /Relationship already exists/i.test(backendErrRaw)
        ) {
          loadPendingInvites();
        }

        throw new Error(
          backendErr || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      if (data && data.success) {
        showNotification(`Đã gửi lời mời đến ${email}!`, "success");
        addHostForm.reset();
        hideModal();
        loadHosts();
        loadPendingInvites();
      } else {
        const backendErrRaw = data && (data.error || data.message);
        throw new Error(
          translateBackendError(backendErrRaw) || "Gửi lời mời thất bại"
        );
      }
    } catch (error) {
      console.error("Add host error:", error);
      if (errorBox) {
        errorBox.textContent = error.message;
        errorBox.style.display = "block";
      } else {
        showNotification(`Thêm máy chủ thất bại: ${error.message}`, "error");
      }
    }
  });

  // Host Actions
  hostsGrid.addEventListener("click", function (e) {
    const target = e.target.closest("button");
    if (!target) return;

    const hostId = target.dataset.hostId;

    if (target.classList.contains("control-btn") && !target.disabled) {
      console.log("Control host:", hostId);
      handleControlHost(hostId);
    } else if (target.classList.contains("remove-btn")) {
      console.log("Remove host:", hostId);
      handleRemoveHost(hostId);
    }
  });

  // Modal Functions
  function showModal() {
    addHostModal.classList.add("show");
    document.body.style.overflow = "hidden";

    // Focus on email input
    setTimeout(() => {
      document.getElementById("host-email").focus();
    }, 100);
  }

  function hideModal() {
    addHostModal.classList.remove("show");
    document.body.style.overflow = "";

    // Reset form
    addHostForm.reset();
  }

  // Host Management Functions
  function handleControlHost(hostId) {
    const hostCard = document
      .querySelector(`[data-host-id="${hostId}"]`)
      .closest(".host-card");
    const hostName = hostCard.querySelector(".host-name").textContent;

    if (confirm(`Start remote control session with ${hostName}?`)) {
      console.log(`Starting control session with host ${hostId}`);

      // Open auto-ws-controller in new window
      const controllerUrl = "/tools/auto-ws-controller.html";
      const windowFeatures =
        "width=1400,height=900,menubar=no,toolbar=no,location=no,status=yes,scrollbars=yes,resizable=yes";
      window.open(controllerUrl, `RemoteControl_${hostId}`, windowFeatures);
    }
  }

  async function handleRemoveHost(hostId) {
    const hostCard = document
      .querySelector(`[data-host-id="${hostId}"]`)
      .closest(".host-card");
    const hostName = hostCard.querySelector(".host-name").textContent;
    const relationshipId = document.querySelector(`[data-host-id="${hostId}"]`)
      .dataset.relationshipId;

    if (confirm(`Remove ${hostName} from your hosts list?`)) {
      console.log(`Removing host ${hostId}, relationship ${relationshipId}`);

      try {
        const token = localStorage.getItem("auth_token");
        const response = await fetch(
          `${APP_CONFIG.AUTH_BASE}/api/hosts/${relationshipId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        let data;
        try {
          data = await response.json();
        } catch (_) {
          data = null;
        }

        if (!response.ok) {
          const backendErr = data && (data.error || data.message);
          throw new Error(
            backendErr || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        if (data && data.success) {
          hostCard.remove();
          checkEmptyState();
          showNotification(
            `${hostName} has been removed from your hosts list.`,
            "success"
          );
        } else {
          throw new Error(
            (data && (data.error || data.message)) || "Failed to remove host"
          );
        }
      } catch (error) {
        console.error("Remove host error:", error);
        showNotification(
          `Failed to remove ${hostName}: ${error.message}`,
          "error"
        );
      }
    }
  }

  // Utility Functions
  function checkEmptyState() {
    const hostCards = hostsGrid.querySelectorAll(".host-card");
    if (hostCards.length === 0) {
      hostsGrid.style.display = "none";
      emptyState.style.display = "block";
    } else {
      hostsGrid.style.display = "grid";
      emptyState.style.display = "none";
    }
  }

  function showNotification(message, type = "info") {
    // Simple notification - could be enhanced with a proper notification system
    console.log(`${type.toUpperCase()}: ${message}`);

    // For now, just use alert - replace with better notification UI later
    alert(message);
  }

  // Load hosts data from API
  async function loadHosts() {
    console.log("Loading hosts data...");

    const loadingState = document.getElementById("loading-state");

    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("No auth token");
      }

      const response = await fetch(`${APP_CONFIG.AUTH_BASE}/api/hosts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Hosts data received:", data);

      // Hide loading state
      if (loadingState) {
        loadingState.style.display = "none";
      }

      if (data.success && data.hosts) {
        renderHosts(data.hosts);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Failed to load hosts:", error);

      // Hide loading state
      if (loadingState) {
        loadingState.style.display = "none";
      }

      // Show error or redirect to login
      if (
        error.message.includes("401") ||
        error.message.includes("No auth token")
      ) {
        console.log("Authentication required, redirecting to login...");

        setTimeout(() => {
          window.location.href = "/login/login.html";
          return;
        }, 1000000);
      }

      showNotification("Failed to load hosts: " + error.message, "error");
      checkEmptyState();
    }
  }

  // Load current user profile and update header UI
  async function loadUserProfile() {
    console.log("Loading user profile...");
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) throw new Error("No auth token");

      const res = await fetch(`${APP_CONFIG.AUTH_BASE}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const user = data.user || {};

      // Update header UI
      const avatarEl = document.querySelector(".profile-avatar");
      const nameEl = document.querySelector(".profile-name");
      const roleEl = document.querySelector(".profile-role");

      if (avatarEl)
        avatarEl.src = user.avatar_url || "https://via.placeholder.com/40";
      if (nameEl) nameEl.textContent = user.name || user.email || "User";
      if (roleEl) roleEl.textContent = "Controller";
    } catch (err) {
      console.warn("Failed to load user profile:", err);
      // If token invalid, redirect to login
      if (
        String(err).includes("401") ||
        String(err).includes("No auth token")
      ) {
        window.location.href = "/login/login.html";
      }
    }
  }

  // Render hosts data
  function renderHosts(hosts) {
    console.log("Rendering hosts:", hosts.length);

    if (hosts.length === 0) {
      checkEmptyState();
      return;
    }

    const hostsHTML = hosts
      .map(
        (host) => `
      <div class="host-card">
        <div class="host-info">
          <div class="host-avatar">
            <img src="${
              host.profile_image || "https://via.placeholder.com/50"
            }" alt="Host" />
          </div>
          <div class="host-details">
            <div class="host-name">${escapeHtml(host.display_name)}</div>
            <div class="host-email">${escapeHtml(host.email)}</div>
            <div class="host-status ${host.online_status}">${
          host.online_status === "online" ? "Online" : "Offline"
        }</div>
          </div>
        </div>
        
        <div class="host-actions">
          <button class="control-btn" data-host-id="${
            host.user_id
          }" data-relationship-id="${host.relationship_id}" ${
          host.online_status === "offline" ? "disabled" : ""
        }>
            <span>🎮</span> Control
          </button>
          <button class="remove-btn" data-host-id="${
            host.user_id
          }" data-relationship-id="${host.relationship_id}">
            <span>🗑️</span> Remove
          </button>
        </div>
      </div>
    `
      )
      .join("");

    hostsGrid.innerHTML = hostsHTML;
    checkEmptyState();
  }

  // Render pending invitations
  function renderPendingInvites(invites) {
    const section = document.getElementById("pending-invites-section");
    const grid = document.getElementById("pending-invites-grid");
    if (!section || !grid) return;

    if (!invites || invites.length === 0) {
      section.style.display = "none";
      return;
    }

    const html = invites
      .map(
        (inv) => `
      <div class="host-card">
        <div class="host-info">
          <div class="host-avatar">
            <img src="${
              inv.profile_image || "https://via.placeholder.com/50"
            }" alt="Pending" />
          </div>
          <div class="host-details">
            <div class="host-name">${escapeHtml(
              inv.display_name || inv.email
            )}</div>
            <div class="host-email">${escapeHtml(inv.email)}</div>
            <div class="host-status" style="background:rgba(251,191,36,0.15);color:var(--warning);">Đang chờ chấp nhận</div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--muted);">Gửi lúc: ${new Date(
          inv.created_at
        ).toLocaleString("vi-VN")}</div>
        ${
          inv.invitation_message
            ? `<div style="margin-top:8px;font-size:13px;">“${escapeHtml(
                inv.invitation_message
              )}”</div>`
            : ""
        }
      </div>`
      )
      .join("");

    grid.innerHTML = html;
    section.style.display = "block";
  }

  // Load pending invitations
  async function loadPendingInvites() {
    console.log("Loading pending invites...");
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) return;
      const res = await fetch(`${APP_CONFIG.AUTH_BASE}/api/hosts/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        renderPendingInvites(data.invitations || []);
      }
    } catch (err) {
      console.warn("Failed to load pending invites", err);
    }
  }

  // Map backend English errors to Vietnamese
  function translateBackendError(msg) {
    if (!msg) return null;
    const m = msg.toLowerCase();
    if (m.includes("user not found"))
      return "Không tìm thấy người dùng với email này";
    if (m.includes("relationship already exists"))
      return "Bạn đã gửi lời mời trước đó. Vui lòng chờ người kia chấp nhận.";
    if (m.includes("invite already pending or active"))
      return "Lời mời đang chờ hoặc quan hệ đã hoạt động";
    if (m.includes("invitation resent successfully"))
      return "Đã gửi lại lời mời thành công";
    if (m.includes("email is required")) return "Vui lòng nhập email";
    if (m.includes("you cannot invite yourself"))
      return "Không thể tự mời chính bạn";
    if (m.includes("failed to add host")) return "Thêm máy chủ thất bại";
    return msg; // fallback
  }

  // HTML escape utility
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  function init() {
    console.log("Initializing Controller Dashboard...");
    loadUserProfile();
    loadHosts();
    loadPendingInvites();

    // Check authentication
    // TODO: Verify user is logged in and has controller role
    const token = localStorage.getItem("auth_token");
    console.log("🔍 Auth check - token found:", token ? "YES" : "NO");
    console.log("🔍 Token value:", token);

    if (!token) {
      console.log("❌ No auth token found, redirecting to login...");
      setTimeout(() => {
        window.location.href = "/login/login.html";
        return;
      }, 100000);
    }

    console.log("✅ Auth token found, dashboard access granted");

    console.log("Controller Dashboard initialized successfully");
  }

  // Start the application
  init();
})();
