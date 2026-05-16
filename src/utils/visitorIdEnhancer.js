/**
 * Visitor ID Enhancement Utility
 * Transforms original visitor IDs to enhanced format with parsed name components
 * 
 * Pattern:
 * - Original: {org}_{random4digits} (e.g., "kula_digital_solution_7657")
 * - Enhanced: {org}_{firstName}_{lastName}_{random4digits} (e.g., "kula_digital_solution_john_doe_7657")
 */

/**
 * Extract organization name from visitor ID
 * Takes everything before the last `_{digits}` pattern
 * 
 * @param {string} visitorId - Original visitor ID (e.g., "kula_digital_solution_7657")
 * @returns {string} Organization name (e.g., "kula_digital_solution")
 */
function extractOrganization(visitorId) {
  // Match pattern: everything before the last underscore followed by 4+ digits
  const match = visitorId.match(/^(.+)_(\d{4,})$/);
  if (!match) return visitorId; // If pattern doesn't match, return as-is
  return match[1]; // Return org part (before last _digits)
}

/**
 * Extract random digits from visitor ID
 * Captures the last sequence of 4+ digits after final underscore
 * 
 * @param {string} visitorId - Original visitor ID
 * @returns {string} Random digits (e.g., "7657")
 */
function extractRandomDigits(visitorId) {
  const match = visitorId.match(/_(\d{4,})$/);
  return match ? match[1] : '';
}

/**
 * Sanitize string for URL safety
 * Replace special characters with underscores, keep alphanumeric + underscore only
 * 
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeForUrl(str) {
  if (!str) return '';
  
  // Convert to lowercase
  let sanitized = str.toLowerCase();
  
  // Replace spaces, dots, and special chars with underscores
  sanitized = sanitized.replace(/[\s.,'"-]/g, '_');
  
  // Remove any remaining special characters (keep only alphanumeric + underscore)
  sanitized = sanitized.replace(/[^a-z0-9_]/g, '');
  
  // Remove multiple consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');
  
  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  
  return sanitized;
}

/**
 * Parse name into firstName and lastName components
 * 
 * Rules:
 * - Single word: firstName=word, lastName='' (empty)
 * - Multi-word: firstName=first_word, lastName=remaining_words_joined
 * - Special suffixes (Jr., Sr., etc.): Keep them in lastName
 * 
 * @param {string} name - Full name to parse
 * @returns {Object} { firstName: string, lastName: string }
 */
function parseName(name) {
  if (!name || typeof name !== 'string') {
    return { firstName: '', lastName: '' };
  }

  const trimmedName = name.trim();
  
  if (!trimmedName) {
    return { firstName: '', lastName: '' };
  }

  // Split on whitespace
  const parts = trimmedName.split(/\s+/).filter(p => p.length > 0);

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    // Single word: first name only
    return {
      firstName: sanitizeForUrl(parts[0]),
      lastName: ''
    };
  }

  // Multi-word: first word is firstName, rest is lastName
  const firstName = parts[0];
  const lastName = parts.slice(1).join('_'); // Join remaining parts with underscore

  return {
    firstName: sanitizeForUrl(firstName),
    lastName: sanitizeForUrl(lastName)
  };
}

/**
 * Enhance visitor ID with parsed name components
 * 
 * @param {string} originalVisitorId - Original ID (e.g., "kula_digital_solution_7657")
 * @param {string} name - Full name (e.g., "John Doe" or "Radhakrishnan")
 * @returns {string} Enhanced visitor ID (e.g., "kula_digital_solution_john_doe_7657")
 * 
 * Examples:
 * - enhanceVisitorId("acme_5829", "John Doe") → "acme_john_doe_5829"
 * - enhanceVisitorId("acme_5829", "Radhakrishnan") → "acme_radhakrishnan_5829"
 * - enhanceVisitorId("kula_digital_solution_7657", "Jane Smith Jr.") → "kula_digital_solution_jane_smith_jr_7657"
 * - enhanceVisitorId("org_1234", "") → "org_1234" (no change if name is empty)
 */
export function enhanceVisitorId(originalVisitorId, name) {
  // If no name provided, return original ID
  if (!name || typeof name !== 'string' || name.trim() === '') {
    console.log(`⚠️ No name provided, returning original visitor_id: ${originalVisitorId}`);
    return originalVisitorId;
  }

  const organization = extractOrganization(originalVisitorId);
  const randomDigits = extractRandomDigits(originalVisitorId);
  const { firstName, lastName } = parseName(name);

  // Build enhanced ID: {org}_{firstName}_{lastName}_{randomDigits}
  // But omit empty lastName
  let enhancedId;
  if (lastName) {
    enhancedId = `${organization}_${firstName}_${lastName}_${randomDigits}`;
  } else {
    enhancedId = `${organization}_${firstName}_${randomDigits}`;
  }

  // Safety: If enhanced ID is same as original, return original
  if (enhancedId === originalVisitorId) {
    return originalVisitorId;
  }

  return enhancedId;
}

/**
 * Validate enhanced visitor ID format (for testing)
 * Ensures it follows the expected pattern
 * 
 * @param {string} visitorId - Visitor ID to validate
 * @returns {boolean} True if valid format
 */
export function isValidVisitorIdFormat(visitorId) {
  // Should match pattern: {org}_{something}_{digits}
  return /^[a-z0-9_]+_[a-z0-9_]+_\d{4,}$/.test(visitorId);
}

export default {
  enhanceVisitorId,
  isValidVisitorIdFormat
};
