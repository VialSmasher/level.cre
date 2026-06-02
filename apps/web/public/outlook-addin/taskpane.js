Office.onReady(function () {
  var intakeAddress = '8feefe98cef5cf7437bbdb5d2e20e761@inbound.postmarkapp.com';
  var button = document.getElementById('add-bcc');
  var status = document.getElementById('status');

  function addBcc(callback) {
    var item = Office.context.mailbox.item;
    item.bcc.getAsync(function (getResult) {
      if (getResult.status !== Office.AsyncResultStatus.Succeeded) {
        callback((getResult.error && getResult.error.message) || 'Could not read BCC recipients.');
        return;
      }

      var existing = getResult.value || [];
      var alreadyAdded = existing.some(function (recipient) {
        var email = (recipient.emailAddress || recipient.displayName || '').toLowerCase();
        return email === intakeAddress;
      });

      if (alreadyAdded) {
        callback(null, 'Level CRE BCC is already on this email.');
        return;
      }

      item.bcc.addAsync(
        [{ displayName: 'Level CRE BCC', emailAddress: intakeAddress }],
        function (addResult) {
          if (addResult.status !== Office.AsyncResultStatus.Succeeded) {
            callback((addResult.error && addResult.error.message) || 'Could not add Level CRE BCC.');
            return;
          }
          callback(null, 'Level CRE BCC added.');
        }
      );
    });
  }

  button.addEventListener('click', function () {
    status.textContent = 'Adding BCC...';
    addBcc(function (error, message) {
      status.textContent = error ? error : message;
    });
  });
});
