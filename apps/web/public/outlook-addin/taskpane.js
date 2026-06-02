Office.onReady(function () {
  var button = document.getElementById('add-bcc');
  var status = document.getElementById('status');
  button.addEventListener('click', function () {
    status.textContent = 'Adding BCC...';
    window.LevelCreAddIn.addBcc(function (error, message) {
      status.textContent = error ? error : message;
    });
  });
});
