/**
 * Safely parses a JSON string
 * @param {string|Array} value - The value to parse
 * @param {Array|Object} defaultValue - Default value if parsing fails
 * @returns {Array|Object} Parsed value or default
 */
function safeJSONParse(value, defaultValue = []) {
    // If null or undefined, return default
    if (value == null) return defaultValue;
    
    // If already an array or object, return as is
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      return value;
    }
    
    // Try to parse the string
    try {
      return JSON.parse(value);
    } catch (e) {
      console.error('JSON Parse error:', e);
      return defaultValue;
    }
  }
  
  module.exports = {
    safeJSONParse
  };