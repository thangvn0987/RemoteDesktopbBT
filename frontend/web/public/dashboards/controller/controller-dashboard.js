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
    // TODO: Implement logout
    if (confirm("Are you sure you want to logout?")) {
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

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("http://localhost:8081/api/hosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, message }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        showNotification(`Invitation sent to ${email}!`, "success");

        // Reset form and close modal
        addHostForm.reset();
        hideModal();

        // Reload hosts to show updated list
        loadHosts();
      } else {
        throw new Error(data.error || "Failed to send invitation");
      }
    } catch (error) {
      console.error("Add host error:", error);
      showNotification(`Failed to add host: ${error.message}`, "error");
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
    // TODO: Implement remote control session
    const hostCard = document
      .querySelector(`[data-host-id="${hostId}"]`)
      .closest(".host-card");
    const hostName = hostCard.querySelector(".host-name").textContent;

    if (confirm(`Start remote control session with ${hostName}?`)) {
      console.log(`Starting control session with host ${hostId}`);
      // TODO: Open remote control window/interface
      alert(`Connecting to ${hostName}... (Feature coming soon!)`);
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
          `http://localhost:8081/api/hosts/${relationshipId}`,
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
          // Remove from DOM
          hostCard.remove();

          // Check if hosts grid is empty
          checkEmptyState();

          // Show success message
          showNotification(
            `${hostName} has been removed from your hosts list.`,
            "success"
          );
        } else {
          throw new Error(data.error || "Failed to remove host");
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

      const response = await fetch("http://localhost:8081/api/hosts", {
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
        window.location.href = "/login/login.html";
        return;
      }

      showNotification("Failed to load hosts: " + error.message, "error");
      checkEmptyState();
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

  // HTML escape utility
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  // function init() {
  //   console.log('Initializing Controller Dashboard...');
  //   loadHosts();

  //   // Check authentication
  //   // TODO: Verify user is logged in and has controller role
  //   const token = localStorage.getItem('auth_token');
  //   if (!token) {
  //     console.log('No auth token found, redirecting to login...');
  //     window.location.href = '/login/login.html';
  //     return;
  //   }

  //   console.log('Controller Dashboard initialized successfully');
  // }

  // Start the application
  init();
})();
