// Esconde a abertura depois de um instante.
window.addEventListener('load', () => {
  setTimeout(() => document.getElementById('splash').classList.add('is-hidden'), 1100);
});

// Ativa o modo offline e permite instalar o app.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Botão "Instalar o app" (Chrome/Android), quando o navegador oferecer.
let installPrompt = null;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
