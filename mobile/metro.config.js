const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Codice di dominio condiviso con il sito (tipi, regole, parser): ../shared
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];
module.exports = config;
