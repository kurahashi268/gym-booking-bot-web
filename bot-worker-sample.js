// Piscina worker wrapper for the bot
// This file acts as a bridge between Piscina and the bot's run function

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Import the bot (CommonJS module)
const botModule = require(path.join(__dirname, '../new-version/dist/index.js'));
const botRun = botModule.default || botModule;

// Piscina will call this default export with the task object
export default async function worker(task) {
  // Destructure the task object to get the parameters
  const { configData, isProduction, profile } = task;
  
  // Call the bot's run function with the correct parameters
  return await botRun(configData, isProduction, profile);
}

