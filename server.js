// Load environment variables
require('dotenv').config();

const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

// Register static files
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/public/'
});

// Register EJS view engine
fastify.register(require('@fastify/view'), {
  engine: {
    ejs: require('ejs')
  },
  root: path.join(__dirname, 'views')
});

// Bot execution state
const botState = {
  isRunning: false,
  lastRun: null,
  results: []
};

// Paths - use environment variables with fallback to defaults
const BOT_DIR = process.env.BOT_DIR || path.join(__dirname, '..', 'new-version');
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(BOT_DIR, 'config.json');
const AUTH_PATH = process.env.AUTH_PATH || path.join(__dirname, 'auth.json');
const crypto = require('crypto');

// Helper function to read auth
async function readAuth() {
  try {
    const data = await fs.readFile(AUTH_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

// Helper function to update password
async function updatePassword(newPassword) {
  await fs.writeFile(AUTH_PATH, JSON.stringify({ password: newPassword }, null, 2), 'utf-8');
}

// Simple auth token generation (hash of password)
function generateAuthToken(password) {
  return crypto.createHash('sha256').update(password + 'ritmos-bot-salt').digest('hex');
}

// Helper to verify password
async function verifyPassword(password) {
  const auth = await readAuth();
  if (!auth) return false;
  return auth.password === password;
}

// Helper to check auth token
async function checkAuthToken(token) {
  const auth = await readAuth();
  if (!auth) return false;
  const expectedToken = generateAuthToken(auth.password);
  return token === expectedToken;
}

// Helper function to read config
async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

// Helper function to write config
async function writeConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// Login page route
fastify.get('/login', async (request, reply) => {
  const token = request.query.token;
  if (token && await checkAuthToken(token)) {
    // Already authenticated, redirect to main page
    return reply.redirect('/');
  }
  return reply.view('login.ejs', { error: null });
});

// Login POST route
fastify.post('/api/login', async (request, reply) => {
  const { password } = request.body;
  
  if (!password) {
    return reply.status(400).send({ success: false, error: 'Password required' });
  }
  
  const isValid = await verifyPassword(password);
  
  if (isValid) {
    const token = generateAuthToken(password);
    return { success: true, token };
  } else {
    return reply.status(401).send({ success: false, error: 'Invalid password' });
  }
});

// Update password route
fastify.post('/api/update-password', async (request, reply) => {
  const { currentPassword, newPassword } = request.body;
  
  if (!currentPassword || !newPassword) {
    return reply.status(400).send({ success: false, error: 'Current password and new password required' });
  }
  
  const isValid = await verifyPassword(currentPassword);
  
  if (!isValid) {
    return reply.status(401).send({ success: false, error: 'Current password is incorrect' });
  }
  
  await updatePassword(newPassword);
  const token = generateAuthToken(newPassword);
  
  return { success: true, message: 'Password updated successfully', token };
});

// Auth middleware for protected routes
async function requireAuth(request, reply) {
  const token = request.query.token || request.headers['x-auth-token'];
  
  if (!token) {
    if (request.headers.accept && request.headers.accept.includes('application/json')) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }
    return reply.redirect('/login');
  }
  
  const isValid = await checkAuthToken(token);
  if (!isValid) {
    if (request.headers.accept && request.headers.accept.includes('application/json')) {
      return reply.status(401).send({ success: false, error: 'Invalid authentication token' });
    }
    return reply.redirect('/login');
  }
  
  return null; // Auth passed
}

// Home/Index route (protected)
fastify.get('/', async (request, reply) => {
  const authCheck = await requireAuth(request, reply);
  if (authCheck) return authCheck;
  
  const config = await readConfig();
  if (!config) {
    return reply.code(500).send('Error: Could not read bot configuration. Please ensure config.json exists in new-version/');
  }
  
  const latestResult = botState.results.length > 0 ? botState.results[botState.results.length - 1] : null;
  
  return reply.view('index.ejs', {
    config,
    isRunning: botState.isRunning,
    latestResult,
    allResults: botState.results.slice(-10).reverse() // Last 10 results
  });
});

// Get config route (JSON API) - protected
fastify.get('/api/config', async (request, reply) => {
  const authCheck = await requireAuth(request, reply);
  if (authCheck) return authCheck;
  
  const config = await readConfig();
  return { success: true, config };
});

// Update config route - protected
fastify.post('/api/config', async (request, reply) => {
  const authCheck = await requireAuth(request, reply);
  if (authCheck) return authCheck;
  try {
    const newConfig = request.body;
    
    // Validate config structure
    if (!newConfig.login || !newConfig.reservation || !newConfig.store || !newConfig.lesson) {
      return reply.status(400).send({ success: false, error: 'Invalid config structure' });
    }
    
    await writeConfig(newConfig);
    return { success: true, message: 'Config updated successfully' };
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// Run bot route - protected
fastify.post('/api/run', async (request, reply) => {
  const authCheck = await requireAuth(request, reply);
  if (authCheck) return authCheck;
  if (botState.isRunning) {
    return reply.status(400).send({ success: false, error: 'Bot is already running' });
  }
  
  botState.isRunning = true;
  const runId = Date.now();
  const startTime = new Date();
  
  const result = {
    id: runId,
    startTime: startTime.toISOString(),
    status: 'running',
    logs: [],
    error: null,
    endTime: null,
    duration: null
  };
  
  botState.results.push(result);
  botState.lastRun = result;
  
  // Limit results to last 50
  if (botState.results.length > 50) {
    botState.results = botState.results.slice(-50);
  }
  
  // Run bot in background
  runBot(runId, result).catch(err => {
    console.error('Bot execution error:', err);
  });
  
  return { success: true, runId, message: 'Bot started' };
});

// Get bot status route - protected
fastify.get('/api/status', async (request, reply) => {
  const authCheck = await requireAuth(request, reply);
  if (authCheck) return authCheck;
  return {
    isRunning: botState.isRunning,
    lastRun: botState.lastRun,
    latestResults: botState.results.slice(-10).reverse()
  };
});

// Get results route - protected
fastify.get('/api/results/:runId', async (request, reply) => {
  const authCheck = await requireAuth(request, reply);
  if (authCheck) return authCheck;
  const runId = parseInt(request.params.runId);
  const result = botState.results.find(r => r.id === runId);
  
  if (!result) {
    return reply.status(404).send({ success: false, error: 'Result not found' });
  }
  
  return { success: true, result };
});

// Function to run the bot
async function runBot(runId, result) {
  return new Promise(async (resolve) => {
    const resultIndex = botState.results.findIndex(r => r.id === runId);
    if (resultIndex === -1) return resolve();
    
    // Check if bot is built, if not build it first
    try {
      await fs.access(path.join(BOT_DIR, 'dist', 'index.js'));
    } catch (error) {
      // Bot not built, build it first
      result.logs.push({
        time: new Date().toISOString(),
        type: 'stdout',
        message: 'Bot not built. Building...'
      });
      
      const buildProcess = spawn('pnpm', ['run', 'build'], {
        cwd: BOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      await new Promise((buildResolve) => {
        buildProcess.on('close', (code) => {
          if (code !== 0) {
            result.status = 'error';
            result.success = false;
            result.error = 'Failed to build bot';
            botState.isRunning = false;
            return buildResolve();
          }
          buildResolve();
        });
      });
    }
    
    // Change to bot directory and run
    const botProcess = spawn('node', ['dist/index.js', '--production'], {
      cwd: BOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    botProcess.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      result.logs.push({
        time: new Date().toISOString(),
        type: 'stdout',
        message: text.trim()
      });
    });
    
    botProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      result.logs.push({
        time: new Date().toISOString(),
        type: 'stderr',
        message: text.trim()
      });
    });
    
    botProcess.on('close', (code) => {
      const endTime = new Date();
      result.endTime = endTime.toISOString();
      result.duration = ((endTime - new Date(result.startTime)) / 1000).toFixed(3);
      result.status = code === 0 ? 'completed' : 'failed';
      result.exitCode = code;
      result.stdout = stdout;
      result.stderr = stderr;
      
      // Determine success based on logs
      const logsText = stdout + stderr;
      if (code === 0 && logsText.includes('プログラム終了') && !logsText.includes('ループアウト') && !logsText.includes('エラー')) {
        result.success = true;
      } else {
        result.success = false;
        if (logsText.includes('ループアウト')) {
          result.error = 'Loop timeout - lesson selection failed';
        } else if (code !== 0) {
          result.error = `Process exited with code ${code}`;
        } else {
          result.error = 'Unknown error';
        }
      }
      
      botState.isRunning = false;
      botState.lastRun = result;
      
      // Update result in array
      if (resultIndex !== -1) {
        botState.results[resultIndex] = result;
      }
      
      resolve();
    });
    
    botProcess.on('error', (error) => {
      const endTime = new Date();
      result.endTime = endTime.toISOString();
      result.duration = ((endTime - new Date(result.startTime)) / 1000).toFixed(3);
      result.status = 'error';
      result.success = false;
      result.error = error.message;
      result.stderr = error.stack || error.message;
      
      botState.isRunning = false;
      botState.lastRun = result;
      
      if (resultIndex !== -1) {
        botState.results[resultIndex] = result;
      }
      
      resolve();
    });
  });
}

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

