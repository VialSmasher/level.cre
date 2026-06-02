(function () {
  var LEVEL_CRE_INTAKE_ADDRESS = '8feefe98cef5cf7437bbdb5d2e20e761@inbound.postmarkapp.com';
  var LEVEL_CRE_DISPLAY_NAME = 'Level CRE BCC';

  function notify(message) {
    var item = Office.context.mailbox.item;
    if (!item.notificationMessages) return;
    item.notificationMessages.replaceAsync('level-cre-status', {
      type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
      message: message,
      icon: 'Icon.16x16',
      persistent: false
    });
  }

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
        return email === LEVEL_CRE_INTAKE_ADDRESS;
      });

      if (alreadyAdded) {
        callback(null, 'Level CRE BCC is already on this email.');
        return;
      }

      item.bcc.addAsync(
        [{ displayName: LEVEL_CRE_DISPLAY_NAME, emailAddress: LEVEL_CRE_INTAKE_ADDRESS }],
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

  function addLevelCreBcc(event) {
    addBcc(function (error, message) {
      notify(error ? 'Level CRE: ' + error : message);
      event.completed();
    });
  }

  window.addLevelCreBcc = addLevelCreBcc;
  window.LevelCreAddIn = { addBcc: addBcc, intakeAddress: LEVEL_CRE_INTAKE_ADDRESS };

  Office.initialize = function () {};

  Office.onReady(function () {
    if (Office.actions && Office.actions.associate) {
      Office.actions.associate('addLevelCreBcc', addLevelCreBcc);
    }
  });
})();
