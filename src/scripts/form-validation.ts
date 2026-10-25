// Native browser messages follow the browser installation's language, not html.lang.
// Set English messages without replacing the browser's accessible validation UI.
export function initFormValidation() {
  const isField = (target: EventTarget | null): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
  document.addEventListener('invalid', event => {
    const field = event.target;
    if (!isField(field)) return;
    field.setCustomValidity('');
    const validity = field.validity;
    let message = '';
    if (validity.valueMissing) message = field instanceof HTMLSelectElement ? 'Choose an option.' : 'Please fill out this field.';
    else if (validity.typeMismatch) message = field instanceof HTMLInputElement && field.type === 'email'
      ? 'Enter a valid email address.' : 'Enter a valid URL.';
    else if (validity.badInput) message = 'Enter a valid number.';
    else if (validity.tooShort && 'minLength' in field) message = `Use at least ${field.minLength} characters.`;
    else if (validity.tooLong && 'maxLength' in field) message = `Use no more than ${field.maxLength} characters.`;
    else if (validity.rangeUnderflow && field instanceof HTMLInputElement) message = `Enter a value of at least ${field.min}.`;
    else if (validity.rangeOverflow && field instanceof HTMLInputElement) message = `Enter a value no greater than ${field.max}.`;
    else if (validity.stepMismatch) message = 'Enter a value using the requested increment.';
    else if (validity.patternMismatch) message = 'Use the requested format.';
    field.setCustomValidity(message);
  }, true);
  for (const type of ['input', 'change']) document.addEventListener(type, event => {
    if (isField(event.target)) event.target.setCustomValidity('');
  });
}
