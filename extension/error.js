document.getElementById('message').textContent = new URLSearchParams(location.search).get('message') || 'Ismeretlen hiba.';
document.getElementById('close').addEventListener('click', () => window.close());
