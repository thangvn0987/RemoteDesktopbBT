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
    if (event.origin !== "http://localhost:3000") return;

    if (event.data.type === "AUTH_SUCCESS") {
      console.log("Auth success received:", event.data.token);

      // Redirect based on role
      const role = event.data.role || "controller";
      if (role === "controller") {
        window.location.href =
          "/dashboards/controller/controller-dashboard.html";
      } else {
        window.location.href = "/dashboards/host/host-dashboard.html";
      }
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

    // Listen for popup completion
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);

        // Check for successful auth (token in URL or localStorage)
        const urlParams = new URLSearchParams(window.location.search);
        const token =
          urlParams.get("token") || localStorage.getItem("auth_token");

        if (token) {
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
          // Auth failed or cancelled
          resetButton();
        }
      }
    }, 1000);

    function resetButton() {
      btn.disabled = false;
      btn.innerHTML =
        '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" /><span>Sign in with Google</span>';
    }
  });
})();
