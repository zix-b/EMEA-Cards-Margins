// Temporary display gate only. GitHub permissions still authorize publishing.
(() => {
  const gate = document.getElementById('adminGate');
  const portal = document.getElementById('adminPortal');
  const password = document.getElementById('gatePassword');
  const error = document.getElementById('gateError');

  function lock() {
    portal.hidden = true;
    gate.hidden = false;
    password.value = '';
    password.removeAttribute('aria-invalid');
    error.textContent = '';
  }

  document.getElementById('gateForm').addEventListener('submit', event => {
    event.preventDefault();
    if (password.value !== 'admin2026') {
      error.textContent = 'Incorrect password. Please try again.';
      password.setAttribute('aria-invalid', 'true');
      password.value = '';
      password.focus();
      return;
    }
    password.value = '';
    password.removeAttribute('aria-invalid');
    error.textContent = '';
    gate.hidden = true;
    portal.hidden = false;
    document.getElementById('githubToken').focus();
  });

  document.getElementById('gateLogout').addEventListener('click', () => {
    lock();
    // Reuse the existing disconnect flow to clear credentials and any preview.
    document.getElementById('disconnectButton').click();
    window.location.reload();
  });

  // Returning through browser history also requires the password again.
  window.addEventListener('pagehide', lock);
  window.addEventListener('pageshow', event => { if (event.persisted) lock(); });
})();
