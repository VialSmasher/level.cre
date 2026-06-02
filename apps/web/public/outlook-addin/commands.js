(function () {
  const LEVEL_CRE_INTAKE_ADDRESS = '8feefe98cef5cf7437bbdb5d2e20e761@inbound.postmarkapp.com';
  const LEVEL_CRE_DISPLAY_NAME = 'Level CRE BCC';

  function notify(message) {
    const item = Office.context.mailbox.item;
    if (!item.notificationMessages) return;
    item.notificationMessages.replaceAsync('level-cre-status', {
      type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
      message,
      icon: 'Icon.16x16',
      persistent: false,
    });
  }

  function addBcc(callback) {
    const item = Office.context.mailbox.item;
    item.bcc.getAsync((getResult) => {
      if (getResult.status !== Office.AsyncResultStatus.Succeeded) {
        callback(getResult.error?.message || 'Could not read BCC recipients.');
        return;
      }

      const existing = getResult.value || [];
      const alreadyAdded = existing.some((recipient) => {
        const email = (recipient.emailAddress || recipient.displayName || '').toLowerCase();
        return email === LEVEL_CRE_INTAKE_ADDRESS;
      });

      if (alreadyAdded) {
        callback(null, 'Level CRE BCC is already on this email.');
        return;
      }

      item.bcc.addAsync(
        [{ displayName: LEVEL_CRE_DISPLAY_NAME, emailAddress: LEVEL_CRE_INTAKE_ADDRESS }],
        (addResult) => {
          if (addResult.status !== Office.AsyncResultStatus.Succeeded) {
            callback(addResult.error?.message || 'Could not add Level CRE BCC.');
            return;
          }
          callback(null, 'Level CRE BCC added.');
        },
      );
    });
  }

  function addLevelCreBcc(event) {
    addBcc((error, message) => {
      notify(error ? `Level CRE: ${error}` : message);
      event.completed();
    });
  }

  Office.onReady(() => {
    if (Office.actions && Office.actions.associate) {
      Office.actions.associate('addLevelCreBcc', addLevelCreBcc);
    }
    window.addLevelCreBcc = addLevelCreBcc;
    window.LevelCreAddIn = { addBcc, intakeAddress: LEVEL_CRE_INTAKE_ADDRESS };
  });
})();
