// Temporary display gate only. GitHub permissions still authorize publishing.
(() => {
  const gate = document.getElementById('adminGate');
  const portal = document.getElementById('adminPortal');
  const password = document.getElementById('gatePassword');
  const error = document.getElementById('gateError');
  const githubButton = document.getElementById('showGitHub');
  const githubPanel = document.getElementById('loginPanel');

  githubButton.addEventListener('click', () => {
    githubPanel.hidden = !githubPanel.hidden;
    githubButton.setAttribute('aria-expanded', String(!githubPanel.hidden));
    githubButton.textContent = githubPanel.hidden ? 'Connect GitHub' : 'Hide GitHub connection';
    if (!githubPanel.hidden) document.getElementById('githubToken').focus();
  });

  function lock() {
    portal.hidden = true;
    gate.hidden = false;
    password.value = '';
    password.removeAttribute('aria-invalid');
    error.textContent = '';
    githubPanel.hidden = true;
    githubButton.setAttribute('aria-expanded', 'false');
    githubButton.textContent = 'Connect GitHub';
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
    githubButton.focus();
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
