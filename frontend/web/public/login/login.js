(function () {
  const btn = document.getElementById("google-signin");
  if (!btn) return;

  btn.addEventListener("click", function () {
    // Placeholder: integrate Google OAuth later.
    // For now, just log and simulate redirect.
    console.log("Sign in with Google clicked");
    alert("Sign in with Google (placeholder)\nWill redirect to OAuth flow...");

    // Future: redirect to auth service
    // window.location.href = '/auth/google';
  });
})();
