function safeJSONParse(input, fallback) {
  if (Array.isArray(input)) return input;
  if (typeof input !== 'string') return fallback;
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (typeof parsed === 'string') {
      return [parsed];
    } else {
      return fallback;
    }
  } catch (e) {
    // se è una stringa semplice (es: "bodyweight"), wrappala in array
    return [input];
  }
}

module.exports = { safeJSONParse };
