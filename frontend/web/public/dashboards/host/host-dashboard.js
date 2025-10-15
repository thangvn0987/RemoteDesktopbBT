(function () {
  console.log("Host Dashboard loaded");

  // DOM Elements
  const profileMenuBtn = document.getElementById("profile-menu");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const requestsGrid = document.getElementById("requests-grid");
  const controllersGrid = document.getElementById("controllers-grid");
  const requestsLoading = document.getElementById("requests-loading");
  const controllersLoading = document.getElementById("controllers-loading");
  const requestsEmpty = document.getElementById("requests-empty");
  const controllersEmpty = document.getElementById("controllers-empty");

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
      console.log("Switch to Controller Mode clicked");
      // TODO: Implement role switching
      alert("Switch to Controller Mode - Coming Soon!");
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
      if (token) {
        fetch("http://localhost:8081/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      localStorage.removeItem("auth_token");
      window.location.href = "/login/login.html";
    }
  });

  // Request Actions
  requestsGrid.addEventListener("click", function (e) {
    const target = e.target.closest("button");
    if (!target) return;

    const requestId = target.dataset.requestId;

    if (target.classList.contains("accept-btn")) {
      console.log("Accept request:", requestId);
      handleAcceptRequest(requestId);
    } else if (target.classList.contains("reject-btn")) {
      console.log("Reject request:", requestId);
      handleRejectRequest(requestId);
    }
  });

  // Controller Actions
  controllersGrid.addEventListener("click", function (e) {
    const target = e.target.closest("button");
    if (!target) return;

    const relationshipId = target.dataset.relationshipId;

    if (target.classList.contains("revoke-btn")) {
      console.log("Revoke controller access:", relationshipId);
      handleRevokeController(relationshipId);
    }
  });

  // Load connection requests from API
  async function loadRequests() {
    console.log("Loading connection requests...");

    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("No auth token");
      }

      const response = await fetch("http://localhost:8081/api/host/requests", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Requests data received:", data);

      // Hide loading state
      if (requestsLoading) {
        requestsLoading.style.display = "none";
      }

      if (data.success && data.requests) {
        renderRequests(data.requests);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Failed to load requests:", error);

      // Hide loading state
      if (requestsLoading) {
        requestsLoading.style.display = "none";
      }

      // Show error or redirect to login
      if (
        error.message.includes("401") ||
        error.message.includes("No auth token")
      ) {
        console.log("Authentication required, redirecting to login...");
        window.location.href = "/login/login.html";
        return;
      }

      showNotification("Failed to load requests: " + error.message, "error");
      checkRequestsEmptyState();
    }
  }

  // Load controllers from API
  async function loadControllers() {
    console.log("Loading controllers...");

    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        throw new Error("No auth token");
      }

      const response = await fetch(
        "http://localhost:8081/api/host/controllers",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Controllers data received:", data);

      // Hide loading state
      if (controllersLoading) {
        controllersLoading.style.display = "none";
      }

      if (data.success && data.controllers) {
        renderControllers(data.controllers);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Failed to load controllers:", error);

      // Hide loading state
      if (controllersLoading) {
        controllersLoading.style.display = "none";
      }

      showNotification("Failed to load controllers: " + error.message, "error");
      checkControllersEmptyState();
    }
  }

  // Render requests data
  function renderRequests(requests) {
    console.log("Rendering requests:", requests.length);

    if (requests.length === 0) {
      checkRequestsEmptyState();
      return;
    }

    const requestsHTML = requests
      .map(
        (request) => `
      <div class="request-card">
        <div class="request-info">
          <div class="request-avatar">
            <img src="${
              request.profile_image || "https://via.placeholder.com/50"
            }" alt="Controller" />
          </div>
          <div class="request-details">
            <div class="request-name">${escapeHtml(request.display_name)}</div>
            <div class="request-email">${escapeHtml(request.email)}</div>
            <div class="request-time">${formatTime(request.created_at)}</div>
          </div>
        </div>
        
        ${
          request.invitation_message
            ? `
          <div class="request-message">
            "${escapeHtml(request.invitation_message)}"
          </div>
        `
            : ""
        }
        
        <div class="request-actions">
          <button class="accept-btn" data-request-id="${
            request.relationship_id
          }">
            <span>✅</span> Accept
          </button>
          <button class="reject-btn" data-request-id="${
            request.relationship_id
          }">
            <span>❌</span> Reject
          </button>
        </div>
      </div>
    `
      )
      .join("");

    requestsGrid.innerHTML = requestsHTML;
    checkRequestsEmptyState();
  }

  // Render controllers data
  function renderControllers(controllers) {
    console.log("Rendering controllers:", controllers.length);

    if (controllers.length === 0) {
      checkControllersEmptyState();
      return;
    }

    const controllersHTML = controllers
      .map(
        (controller) => `
      <div class="controller-card">
        <div class="controller-info">
          <div class="controller-avatar">
            <img src="${
              controller.profile_image || "https://via.placeholder.com/50"
            }" alt="Controller" />
          </div>
          <div class="controller-details">
            <div class="controller-name">${escapeHtml(
              controller.display_name
            )}</div>
            <div class="controller-email">${escapeHtml(controller.email)}</div>
            <div class="controller-status ${controller.status}">${
          controller.status === "active" ? "Active" : "Inactive"
        }</div>
          </div>
        </div>
        
        <div class="controller-actions">
          <button class="revoke-btn" data-relationship-id="${
            controller.relationship_id
          }">
            <span>🚫</span> Revoke Access
          </button>
        </div>
      </div>
    `
      )
      .join("");

    controllersGrid.innerHTML = controllersHTML;
    checkControllersEmptyState();
  }

  // Request Management Functions
  async function handleAcceptRequest(requestId) {
    console.log("Accepting request:", requestId);

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `http://localhost:8081/api/host/requests/${requestId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        showNotification("Request accepted successfully!", "success");

        // Reload both lists
        loadRequests();
        loadControllers();
      } else {
        throw new Error(data.error || "Failed to accept request");
      }
    } catch (error) {
      console.error("Accept request error:", error);
      showNotification(`Failed to accept request: ${error.message}`, "error");
    }
  }

  async function handleRejectRequest(requestId) {
    console.log("Rejecting request:", requestId);

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        `http://localhost:8081/api/host/requests/${requestId}/reject`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        showNotification("Request rejected.", "success");

        // Reload requests
        loadRequests();
      } else {
        throw new Error(data.error || "Failed to reject request");
      }
    } catch (error) {
      console.error("Reject request error:", error);
      showNotification(`Failed to reject request: ${error.message}`, "error");
    }
  }

  async function handleRevokeController(relationshipId) {
    const controllerCard = document
      .querySelector(`[data-relationship-id="${relationshipId}"]`)
      .closest(".controller-card");
    const controllerName =
      controllerCard.querySelector(".controller-name").textContent;

    if (confirm(`Revoke access for ${controllerName}?`)) {
      console.log("Revoking controller access:", relationshipId);

      try {
        const token = localStorage.getItem("auth_token");
        const response = await fetch(
          `http://localhost:8081/api/host/controllers/${relationshipId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
          showNotification(`Access revoked for ${controllerName}.`, "success");

          // Reload controllers
          loadControllers();
        } else {
          throw new Error(data.error || "Failed to revoke access");
        }
      } catch (error) {
        console.error("Revoke access error:", error);
        showNotification(`Failed to revoke access: ${error.message}`, "error");
      }
    }
  }

  // Utility Functions
  function checkRequestsEmptyState() {
    const requestCards = requestsGrid.querySelectorAll(".request-card");
    if (requestCards.length === 0) {
      requestsEmpty.style.display = "block";
    } else {
      requestsEmpty.style.display = "none";
    }
  }

  function checkControllersEmptyState() {
    const controllerCards =
      controllersGrid.querySelectorAll(".controller-card");
    if (controllerCards.length === 0) {
      controllersEmpty.style.display = "block";
    } else {
      controllersEmpty.style.display = "none";
    }
  }

  function showNotification(message, type = "info") {
    console.log(`${type.toUpperCase()}: ${message}`);
    alert(message);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  // Load current user profile and update header UI
  async function loadUserProfile() {
    console.log("Loading user profile (host)...");
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) throw new Error("No auth token");

      const res = await fetch("http://localhost:8081/auth/verify", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const user = data.user || {};

      const avatarEl = document.querySelector(".profile-avatar");
      const nameEl = document.querySelector(".profile-name");
      const roleEl = document.querySelector(".profile-role");
      if (avatarEl)
        avatarEl.src = user.avatar_url || "https://via.placeholder.com/40";
      if (nameEl) nameEl.textContent = user.name || user.email || "User";
      if (roleEl) roleEl.textContent = "Host";
    } catch (err) {
      console.warn("Failed to load user profile (host):", err);
      if (String(err).includes("401") || String(err).includes("No auth token")) {
        window.location.href = "/login/login.html";
      }
    }
  }

  // Initialize
    function init() {
      console.log('Initializing Host Dashboard...');

      // Load user profile header
      loadUserProfile();

      // Check authentication
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.log('No auth token found, redirecting to login...');
        window.location.href = '/login/login.html';
        return;
      }

      // Load data
      loadRequests();
      loadControllers();

      console.log('Host Dashboard initialized successfully');
    }

  // Start the application
  init();
})();
