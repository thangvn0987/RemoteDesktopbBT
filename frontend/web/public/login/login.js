(function () {
  console.log("Login script loaded");
  const btn = document.getElementById("google-signin");
  console.log("Button found:", btn);
  if (!btn) {
    console.error("Button with ID google-signin not found!");
    return;
  }

  // Listen for auth success message from popup
  window.addEventListener("message", function (event) {
    console.log("🔔 Received message from:", event.origin, "Data:", event.data);
    console.log("🔍 Message details:", {
      origin: event.origin,
      data: event.data,
      type: typeof event.data,
      hasType: event.data && event.data.type,
      hasToken: event.data && event.data.token,
    });

    // Accept messages from auth service (8081) or same origin (3000)
    if (
      event.origin !== "http://localhost:3000" &&
      event.origin !== "http://localhost:8081"
    ) {
      console.log("❌ Message rejected - invalid origin:", event.origin);
      return;
    }

    console.log("✅ Message origin accepted:", event.origin);

    if (event.data && event.data.type === "AUTH_SUCCESS") {
      console.log("🎉 Auth success received:", event.data.token);

      // Store token in localStorage (parent can access its own localStorage)
      console.log("📝 Storing token in localStorage...");
      console.log("🌐 Current domain:", window.location.origin);
      localStorage.setItem("auth_token", event.data.token);
      console.log("✅ Token stored successfully");

      // Verify token was actually stored
      const storedToken = localStorage.getItem("auth_token");
      console.log(
        "🔍 Verification - stored token:",
        storedToken ? "Found" : "Not found"
      );
      console.log(
        "🔍 Stored token length:",
        storedToken ? storedToken.length : 0
      );

      // Also try storing with a test key to ensure localStorage works
      localStorage.setItem("test_key", "test_value");
      const testValue = localStorage.getItem("test_key");
      console.log(
        "🧪 Test localStorage - works:",
        testValue === "test_value" ? "YES" : "NO"
      );

      // Clear any pending timeout
      if (window.authTimeout) {
        clearTimeout(window.authTimeout);
        console.log("Auth timeout cleared");
      }

      // Get selected role from form
      const selectedRole = document.querySelector('input[name="role"]:checked');
      const role = selectedRole ? selectedRole.value : "controller";

      console.log("🚀 Redirecting with role:", role);

      // Add small delay to ensure localStorage is saved before redirect
      setTimeout(() => {
        if (role === "controller") {
          console.log("📍 Redirecting to controller dashboard...");
          window.location.href =
            "/dashboards/controller/controller-dashboard.html";
        } else {
          console.log("📍 Redirecting to host dashboard...");
          window.location.href = "/dashboards/host/host-dashboard.html";
        }
      }, 100); // 100ms delay to ensure localStorage write completes
    } else {
      console.log("⚠️ Message data invalid or missing type:", event.data);
    }
  });

  btn.addEventListener("click", function (event) {
    console.log("BUTTON CLICKED!", event);
    console.log("Sign in with Google clicked");

    // Get selected role
    const selectedRole = document.querySelector('input[name="role"]:checked');
    const role = selectedRole ? selectedRole.value : "controller";
    console.log("Selected role:", role);

    // Disable button during auth
    btn.disabled = true;
    btn.innerHTML = "<span>Signing in...</span>";

    // Professional popup OAuth with role
    const popup = window.open(
      `http://localhost:8081/auth/google?role=${role}`,
      "google-signin",
      "width=500,height=650,left=" +
        (screen.width / 2 - 250) +
        ",top=" +
        (screen.height / 2 - 325) +
        ",scrollbars=yes,resizable=yes"
    );

    // Handle popup blocked
    if (!popup) {
      alert("Popup blocked! Please allow popups for this site.");
      resetButton();
      return;
    }

    // Set timeout for popup (fallback if postMessage fails)
    const authTimeout = setTimeout(() => {
      console.log("Auth timeout - checking localStorage...");

      const token = localStorage.getItem("auth_token");
      if (token) {
        console.log("Token found in localStorage, redirecting...");

        // Success! Redirect based on role
        const selectedRole = document.querySelector(
          'input[name="role"]:checked'
        );
        const role = selectedRole ? selectedRole.value : "controller";

        if (role === "controller") {
          window.location.href =
            "/dashboards/controller/controller-dashboard.html";
        } else {
          window.location.href = "/dashboards/host/host-dashboard.html";
        }
      } else {
        console.log("No token found - auth failed or cancelled");
        resetButton();
      }
    }, 15000); // 15 second timeout

    // Store timeout ID for cleanup
    window.authTimeout = authTimeout;

    function resetButton() {
      btn.disabled = false;
      btn.innerHTML =
        '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" /><span>Sign in with Google</span>';
    }
  });
})();
