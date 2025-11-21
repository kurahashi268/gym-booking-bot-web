import process from 'node:process';
import Fastify from 'fastify';
import FastifyStatic from '@fastify/static';
import FastifyView from '@fastify/view';
import ejs from 'ejs';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import Piscina from 'piscina';
import dotenv from 'dotenv';

//
const CWD = process.cwd();

// Load environment variables
dotenv.config();
const HOST          =   process.env.HOST || 'localhost';
const PORT          =   process.env.PORT || 3000;
const NODE_ENV      =   process.env.NODE_ENV || 'development';
const AUTH_SALT     =   process.env.AUTH_SALT || 'default_salt';
const AUTH_PATH     =   path.resolve(process.env.AUTH_PATH || 'auth.json');
const BOT_DIR       =   path.resolve(process.env.BOT_DIR || 'bot');
const BOT_ESTIMATED_ELAPSED_SECONDS = parseInt(process.env.BOT_ESTIMATED_ELAPSED_SECONDS) || 10;
const MAX_PROFILE   =   parseInt(process.env.MAX_PROFILE) || 10;

const PROFILES_DIR  =   path.join(CWD, 'profiles');
const STATUS_DIR    =   path.join(CWD, 'status');

// ====================================================================================
// [Fastify Setup]

// Fastify instance
const fastify = Fastify({logger: NODE_ENV === 'development'});

// Register static files
fastify.register(FastifyStatic, {
  root: path.join(CWD, 'public'),
  prefix: '/public/',
});

// Register view engine
fastify.register(FastifyView, {
  engine: {
    ejs: ejs,
  },
  root: path.join(CWD, 'views')
});

// Routes
fastify.get('/', route_homePage);
// ------------------------------------------------------------------
fastify.get('/login', route_loginPage);
fastify.post('/api/login', route_attemptLogin);
fastify.post('/api/update-password', route_updatePassword);
// ------------------------------------------------------------------
fastify.get('/api/profiles', route_listProfiles);
fastify.get('/api/profiles/:profileName', route_getProfile);
fastify.post('/api/profiles/:profileName', route_updateProfile);
fastify.delete('/api/profiles/:profileName', route_deleteProfile);
// ------------------------------------------------------------------
fastify.post('/api/run-selected', route_runSelected);
fastify.post('/api/run-all', route_runAll);
// ------------------------------------------------------------------
fastify.get('/api/profiles/status', route_getProfileStatus);

// ====================================================================================
// [Route Handlers]

async function route_homePage(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const profiles = await listProfiles();
  const profilesWithStatus = await getProfilesWithStatus(profiles);
  return reply.view('index.ejs', {profiles: profilesWithStatus, maxProfiles: MAX_PROFILE});
}

async function route_loginPage(request, reply) {
  const guestCheck = await requireGuest(request, reply);
  if(guestCheck) return guestCheck;

  return reply.view('login.ejs', {error: null});
}

async function route_attemptLogin(request, reply) {
  const {password} = request.body;
  if(!password) {
    return reply.status(400).send({ success: false, error: 'パスワードは必須です'});
  }

  const isValid = await verifyPassword(password);

  if(!isValid) {
    return reply.status(401).send({ success: false, error: 'パスワードが正しくありません'});
  }

  const {authToken, expiresAt} = generateAuthToken();
  const success = await updateAuthToken(authToken, expiresAt);
  if(!success) {
    return reply.status(500).send({ success: false, error: '認証トークンの更新に失敗しました'});
  }
  return { success: true, token: authToken };
}

async function route_updatePassword(request, reply) {
  const {oldPassword, newPassword} = request.body;
  if(!oldPassword || !newPassword) {
    return reply.status(400).send({ success: false, error: '現在のパスワードと新しいパスワードは必須です'});
  }

  const isValid = await verifyPassword(oldPassword);
  if(!isValid) return reply.status(401).send({ success: false, error: '現在のパスワードが正しくありません'});

  const success = await updatePassword(newPassword);
  if(!success) {
    return reply.status(500).send({ success: false, error: 'パスワードの更新に失敗しました'});
  }

  return { success: true };
}

async function route_listProfiles(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const profiles = await listProfiles();
  const profilesWithStatus = await getProfilesWithStatus(profiles);

  return { success: true, profiles: profilesWithStatus };
}

async function route_getProfile(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const {profileName} = request.params;
  const config = await getProfile(profileName);

  if(!config) {
    return reply.status(404).send({ success: false, error: 'プロファイルが見つかりません'});
  }

  const status = await readProfileStatus(profileName);
  return { success: true, profile: {
    name: profileName,
    config,
    status
  } };
}

async function route_updateProfile(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const {profileName} = request.params;
  const newConfig = request.body;

  if(!profileNameValidator(profileName)) {
    return reply.status(400).send({ success: false, error: 'プロファイル名が無効です。英字、数字、アンダースコア、ハイフンのみ使用できます。'});
  }

  if(!profileConfigValidator(newConfig)) {
    return reply.status(400).send({ success: false, error: 'プロファイル設定が無効です'});
  }

  // Check if we are at max profiles (only for new profiles)
  const existingProfiles = await listProfiles();
  const isNew = !existingProfiles.includes(profileName);
  // if(isNew && existingProfiles.length >= MAX_PROFILE) {
  //   return reply.status(400).send({ success: false, error: `Max number of profiles (${MAX_PROFILE}) reached. Delete a profile to add a new one.`});
  // }

  // Save profile
  const success = await saveProfile(profileName, newConfig);
  if(!success) {
    return reply.status(500).send({ success: false, error: 'プロファイルの保存に失敗しました'});
  }

  return { success: true, message: 'プロファイルを正常に保存しました'};
}

async function route_deleteProfile(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const {profileName} = request.params;
  const success = await deleteProfile(profileName);
  if(!success) {
    return reply.status(500).send({ success: false, error: 'プロファイルの削除に失敗しました'});
  }

  return { success: true, message: 'プロファイルを正常に削除しました'};
}

async function route_runSelected(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const {profiles: selectedProfiles} = request.body;
  if(!Array.isArray(selectedProfiles) || selectedProfiles.length === 0) {
    return reply.status(400).send({ success: false, error: '選択されたプロファイルの配列が必要です'});
  }

  // The following profiles will be ignored
  // 1. Profiles that are already running
  // 2. Profiles that don't exist

  //
  if(selectedProfiles.length >= MAX_PROFILE) {
    return reply.status(400).send({ success: false, error: `プロファイルの最大数（${MAX_PROFILE}）に達しました。新しいプロファイルを追加するには、1つのプロファイルを削除してください。`});
  }

  // Run bot for each selected profile
  const results = await Promise.all(selectedProfiles.map(async profile => await runBotForProfile(profile)));
  return { success: true, message: '選択されたプロファイルでボットを開始しました', profiles: selectedProfiles };
}

async function route_runAll(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const profiles = await listProfiles();

  if(profiles.length === 0) {
    return reply.status(400).send({success: false, error: 'プロファイルが見つかりません'});
  }

  // Run bot for each profile
  const results = await Promise.all(profiles.map(async profile => await runBotForProfile(profile)));
  return { success: true, message: 'すべてのプロファイルでボットを開始しました', profiles: profiles };
}

async function route_getProfileStatus(request, reply) {
  const authCheck = await requireAuth(request, reply);
  if(authCheck) return authCheck;

  const profiles = await listProfiles();
  const profilesWithStatus = await getMultiProfileStatus(profiles);
  return { success: true, profiles: profilesWithStatus };
}

// ====================================================================================
// [Helpers]

// Helper to check if the request is an AJAX request
function checkAjax(request) {
  // Checks if the request is an AJAX request
  // return request.headers.accept && request.headers.accept.includes('application/json');
  // Check if request is AJAX: content-type or accept is 'application/json'
  return (
    (request.headers['content-type'] && request.headers['content-type'].includes('application/json')) ||
    (request.headers.accept && request.headers.accept.includes('application/json'))
  );
}

// Helper to get auth token from request
function authToken(request) {
  return request.query.token || request.headers['x-auth-token'];
}

// Helper to require authentication
async function requireAuth(request, reply) {
  const token = authToken(request);

  if(!token || !(await checkAuthToken(token))) {
    if(checkAjax(request)) {
      return reply.status(401).send({error: '認証されていません'});
    }
    return reply.redirect('/login');
  }

  return null;
}

// Helper to require guest
async function requireGuest(request, reply, redirectTo='/') {
  const token = await authToken(request);
  if(token && await checkAuthToken(token)) {
    if(checkAjax(request)) {
      return reply.status(401).send({error: '認証されていません'});
    }
    return reply.redirect(redirectTo);
  }
  return null;
}

// Helper to generate date selector from numbers
function generateDateSelectorFromNumbers(row, col) {
  return `#listcontainer${row} > td:nth-child(${col}) > a > p.lesson_name`;
}

// Helper to generate location selector from numbers
function generateLocationSelectorFromNumbers(row, col) {
  return `#main > div.overflow-wrap > div > fieldset > fieldset > div > table > tbody > tr:nth-child(${row}) > td:nth-child(${col}) > div > label`;
}

// Helper to parse profile's status file
function parseProfileStatus(content) {
  // Initialize status object
  const status = {status: 'inactive', timestamp: null, message: null, elapsed: null};
  
  // If content is empty, return status object
  if(!content || content.trim() === '') {
    return status;
  }

  // Split content into parts
  const parts = content.trim().split('@');
  if(parts.length < 2) {
    return status;
  }

  // Get timestamp and status part
  status.timestamp = parts[0];
  const statusPart = parts[1];

  // If status part is "Running", set status to running
  if(statusPart === "Running") {
    status.status = 'running';
    return status;
  }

  // Split status part into parts
  const statusParts = statusPart.split('#');
  if(statusParts.length < 3) {
    return status;
  }

  // Set status, message, and elapsed
  status.status = statusParts[0] === 'Success' ? 'success' : 'failure';
  status.message = statusParts[1];
  status.elapsed = statusParts[2];
  return status;
}

// Helper to ensure file exists
async function ensureFileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK); // Check if the file exists
  } catch (error) {
    if (error.code === 'ENOENT') { // File does not exist
      try {
        await fs.writeFile(filePath, ''); // Create the file
      } catch (writeError) {
        console.error('{Error creating file} ', writeError);
      }
    } else {
      console.error('{Error accessing file} ', error);
    }
  }
}

// ====================================================================================
// [Validators]

//
function profileNameValidator(profileName) {
  return /^[a-zA-Z0-9_-]+$/.test(profileName);
}

// Function to validate profile configuration
function profileConfigValidator(config) {
  if(!config.login || !config.reservation || !config.store || !config.lesson) {
    return false;
  }
  return true;
}

// ====================================================================================
// [Lower level operations]

// ------------------------------------------------------------------------------------------------
// [Auth related operations]

// Function to ensure directories exist
async function ensureDirectoriesExist() {
  try{
    await fs.mkdir(PROFILES_DIR, {recursive: true});
    await fs.mkdir(STATUS_DIR, {recursive: true});
  } catch (error) {
    console.error('{Error ensuring directories exist} ', error);
    return false;
  }
  return true;
}

// Function to read auth
async function readAuth() {
  try {
    const data = await fs.readFile(AUTH_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('{Error reading auth} ', error);
    return null;
  }
}

// Function to write auth
async function writeAuth(auth) {
  try {
    await fs.writeFile(AUTH_PATH, JSON.stringify(auth, null, 2), 'utf-8');
  } catch (error) {
    console.error('{Error writing auth} ', error);
    return false;
  }
  return true;
}

// Function to update password
async function updatePassword(newPassword) {
  try {
    const hashedPassword = hashPassword(newPassword);
    await fs.writeFile(AUTH_PATH, JSON.stringify({password: hashedPassword}, null, 2), 'utf-8');
  } catch (error) {
    console.error('{Error updating password} ', error);
    return false;
  }
  return true;
}

// Function to verify password
async function verifyPassword(password) {
  const auth = await readAuth();
  if(!auth) return false;
  const hashed = hashPassword(password);
  return hashed === auth.password;
}

// Function to hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + AUTH_SALT).digest('hex');
}

// Function to generate auth token
function generateAuthToken() {
  const authToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60;
  return {authToken, expiresAt};
}

// Function to update auth token
async function updateAuthToken(authToken, expiresAt) {
  try {
    const auth = await readAuth();
    if(!auth) return false;
    auth.authToken = authToken;
    auth.expiresAt = expiresAt;
    const success = await writeAuth(auth);
    return success;
  } catch (error) {
    console.error('{Error writing auth token} ', error);
    return false;
  }
}

// Function to check auth token
async function checkAuthToken(authToken) {  
  const auth = await readAuth();
  if(!auth) return false;
  const now = Date.now();
  if(now > auth.expiresAt) return false;
  return authToken === auth.authToken;
}

// ------------------------------------------------------------------------------------------------
// [Profile related operations]

// Function to list profiles
async function listProfiles() {
  try {
    const files = await fs.readdir(PROFILES_DIR);
    const profiles = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
    return profiles;
  } catch (error) {
    console.error('{Error listing profiles} ', error);
    return [];
  }
}

// Function to get profile
async function getProfile(profileName) {
  try {
    const profilePath = path.join(PROFILES_DIR, `${profileName}.json`);
    const data = await fs.readFile(profilePath, 'utf8');
    const config = JSON.parse(data);
    return config;
  } catch (error) {
    console.error('{Error getting profile} ', error);
    return null;
  }
}

// Function to save profile
async function saveProfile(profileName, config) {
  // Convert number inputs to selector strings before saving
  const dateSelector = generateDateSelectorFromNumbers(config.lesson.date_selector.row, config.lesson.date_selector.col);
  const locationSelector = generateLocationSelectorFromNumbers(config.lesson.location_selector.row, config.lesson.location_selector.col);
  config.lesson.date_selector.selector = dateSelector;
  config.lesson.location_selector.selector = locationSelector;
  try {
    const profilePath = path.join(PROFILES_DIR, `${profileName}.json`);
    await fs.writeFile(profilePath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('{Error saving profile} ', error);
    return false;
  }
  return true;
}

// Function to delete profile
async function deleteProfile(profileName) {
  const profilePath = path.join(PROFILES_DIR, `${profileName}.json`);
  try {
    await fs.unlink(profilePath);
  } catch (error) {
    console.error('{Error deleting profile} ', error);
    return false;
  }
  return true;
}

// ------------------------------------------------------------------------------------------------
// [Profile status related operations]

// Function to read profile status
async function readProfileStatus(profileName) {
  const statusPath = path.join(STATUS_DIR, `${profileName}`);
  try {
    await ensureFileExists(statusPath);
    const content = await fs.readFile(statusPath, 'utf8');
    const parsed = parseProfileStatus(content);

    // if(parsed.status === 'running' && parsed.timestamp) {
    //   const timestampDate = new Date(parsed.timestamp);
    //   const now = new Date();
    //   const passedSeconds = (now - timestampDate) / 1000;
    //   if(passedSeconds > BOT_ESTIMATED_ELAPSED_SECONDS) {
    //     parsed.status = 'inactive';
    //   }
    // }
    return parsed;
  } catch (error) {
    console.error('{Error reading profile status} ', error);
    return null;
  }
}

// Function to get status of multiple profiles
async function getMultiProfileStatus(profiles) {
  const statuses = await Promise.all(
    profiles.map(async (profile) => {
      const status = await readProfileStatus(profile);
      return {
        name: profile,
        status,
      };
    })
  );
  return statuses;
}

// Function to get profiles with status
async function getProfilesWithStatus(profiles) {
  const profilesWithStatus = await Promise.all(
    profiles.map(async (profile) => {
      const config = await getProfile(profile);
      const status = await readProfileStatus(profile);
      return {
        name: profile,
        config,
        status
      };
    })
  );
  return profilesWithStatus;
}

// ------------------------------------------------------------------------------------------------
// [Bot related operations]

// Function to check if a profile is running
async function checkProfileRunning(profileName) {
  const status = await readProfileStatus(profileName);
  if(!status) {
    console.log(`Profile Status ${profileName} not found`);
    return false;
  }
  
  return status.status === 'running';
}

// Function to run bot for a specific profile
async function runBotForProfile(profileName) {
  // Get profile configuration
  const config = await getProfile(profileName);
  if(!config) {
    console.log(`Profile ${profileName} not found`);
    return false;
  }

  // Check if the profile is already running
  if(await checkProfileRunning(profileName)) {
    console.log(`Profile ${profileName} is already running`);
    return false;
  }

  //
  runBot(profileName, config);
  return true;
}

// Function to run bot
async function runBot(profileName, config) {
  console.log('[Trace] Running bot for profile: ', profileName);
  try {
    await piscina.run({ configData: config, isProduction: true, profile: profileName });
  } catch (err) {
    console.error('Failed to run bot with Piscina: ', err);
    return false;
  }
  return true;
}

// ====================================================================================
// [Global objects]

const piscina = new Piscina({
  filename: path.join(BOT_DIR, 'index.js'),
  maxThreads: MAX_PROFILE,
});

// ====================================================================================
// [Start]

//
async function startServer() {
  await ensureDirectoriesExist();
  try{
    await fastify.listen({port: PORT, host: HOST});
    console.log(`Server is running on ${HOST}:${PORT} in ${NODE_ENV} mode`);
  } catch (error) {
    console.error('{Error starting server} ', error);
    process.exit(1);
  }
  // Note: Server will keep running until process is terminated
  // fastify.close() should only be called on graceful shutdown
}

// Start server
startServer();