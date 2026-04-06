const { app } = require('electron');
const { EncryptionService } = require('./electron/services/encryption-service');

// We simulate what EncryptionService does
const enc = new EncryptionService();
enc.getMachineKey = () => Buffer.alloc(32, 1);

const original = 'GOCSPX-abcdefg123456';
const hex = enc.encryptString(original);
const decrypted = enc.decryptString(hex);
console.log('Original: ', original);
console.log('Hex: ', hex);
console.log('Decrypted: ', decrypted);
console.log('Match? ', original === decrypted);
