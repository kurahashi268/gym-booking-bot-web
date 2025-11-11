# Ritmos Bot Web Controller

A Fastify + EJS web interface for controlling and monitoring the Ritmos booking bot.

## Features

- 📝 **Configure Bot**: Edit bot configuration through a web form
- 🚀 **Run Bot**: Execute the bot directly from the web interface
- 📊 **View Results**: See execution results including:
  - Success/failure status
  - Execution time
  - Detailed logs
  - Error messages
- 📜 **Execution History**: View past execution results

## Setup

1. Install dependencies:
```bash
cd web
npm install
```

2. Make sure the bot project is set up:
```bash
cd ../new-version
pnpm install
pnpm run build
```

## Usage

Start the web server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

Then open your browser to `http://localhost:3000`

## API Endpoints

- `GET /` - Main dashboard
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `POST /api/run` - Start bot execution
- `GET /api/status` - Get bot status and latest results
- `GET /api/results/:runId` - Get specific execution result

## Configuration

The web interface allows you to configure:
- Login credentials (ID and password)
- Reservation time (datetime)
- Flying time (seconds)
- Confirm reservation flag
- Store index
- Lesson date selector (CSS selector)
- Lesson location selector (CSS selector)

## Notes

- The bot must be built before running (the web interface will attempt to build it automatically if needed)
- Only one bot instance can run at a time
- Execution results are stored in memory (lost on server restart)
- Logs are captured in real-time during bot execution

