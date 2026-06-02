Office.onReady(() => {
  const button = document.getElementById('add-bcc');
  const status = document.getElementById('status');
  button.addEventListener('click', () => {
    status.textContent = 'Adding BCC...';
    window.LevelCreAddIn.addBcc((error, message) => {
      status.textContent = error ? error : message;
    });
  });
});
