import CryptoJS from 'crypto-js';

// The secret key used for AES encryption. 
// In a real production app, this would be in a .env file.
// For this private mobile IDE over WiFi, this acts as the "WiFi Password" for your app.
const SECRET_KEY = 'GravityLink-Private-Key-2026';

/**
 * Encrypts a JSON object or string into an AES ciphertext string.
 * @param {any} data - The data to encrypt
 * @returns {string} - The encrypted ciphertext
 */
export const encryptPayload = (data) => {
  try {
    const stringifiedData = typeof data === 'string' ? data : JSON.stringify(data);
    const ciphertext = CryptoJS.AES.encrypt(stringifiedData, SECRET_KEY).toString();
    return ciphertext;
  } catch (error) {
    console.error('Encryption failed:', error);
    return null;
  }
};

/**
 * Decrypts an AES ciphertext string back into an object/string.
 * @param {string} ciphertext - The encrypted string
 * @returns {any} - The decrypted data
 */
export const decryptPayload = (ciphertext) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    
    // Attempt to parse as JSON, fallback to string
    try {
      return JSON.parse(decryptedString);
    } catch {
      return decryptedString;
    }
  } catch (error) {
    console.error('Decryption failed (Invalid key or corrupted data):', error);
    return null;
  }
};
