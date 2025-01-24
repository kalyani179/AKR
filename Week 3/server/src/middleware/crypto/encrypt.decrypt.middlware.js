const CryptoJS = require('crypto-js');
const dotenv = require('dotenv');
dotenv.config({path:'./../../.env'});
 
const SECRET_KEY = process.env.JWT_SECRET; 
 
function encryptData(data) {
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
    return encrypted;
}
 
function decryptData(encryptedData) {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    if (!decryptedText) {
        throw new Error('Decryption resulted in empty string');
    }
    return JSON.parse(decryptedText);
}
 
// Middleware to decrypt request payload
function decryptMiddleware(req, res, next) {
    try {
      if (req.body && req.body.encryptedPayload) {
        console.log('Encrypted Payload (Backend):', req.body.encryptedPayload);
 
        // Validate if payload is a non-empty string
        if (typeof req.body.encryptedPayload !== 'string' || !req.body.encryptedPayload.trim()) {
          throw new Error('Encrypted payload is invalid or empty');
        }
 
        const decryptedData = decryptData(req.body.encryptedPayload);
        req.body = decryptedData; // Replace req.body with decrypted data
        console.log('Decrypted Payload (Backend):', req.body);
      }
      next();
    } catch (error) {
      console.error('Decryption error:', error.message);
      res.status(400).json({ message: 'Invalid encrypted payload' });
    }
  }
 
 
// Middleware to encrypt response payload
function encryptMiddleware(req, res, next) {
  const originalSend = res.send; // Backup original `res.send` method
 
  res.send = function (data) {
    try {
      const encryptedData = encryptData(JSON.parse(data));
      originalSend.call(this, JSON.stringify({ encryptedPayload: encryptedData }));
    } catch (error) {
      console.error('Encryption error:', error.message);
      originalSend.call(this, data); // Fallback to sending raw data if encryption fails
    }
  };
 
  next(); // Proceed to the next middleware
}
 
module.exports = { decryptMiddleware, encryptMiddleware };