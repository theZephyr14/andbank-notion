# AndBank → Notion Sync

Automatically sync loan data from Andbank to a Notion database. Uses a **mock SFTP server** that mimics real Andbank SFTP exports - when you get real bank credentials, just swap the connection details. Syncs automatically every 15 minutes.

## 🏗️ Architecture

- **Mock SFTP Server**: SFTP server that mimics Andbank's SFTP export (hosted on Render)
- **Sync Worker**: Fetches loan data via SFTP and updates Notion database (auto-syncs every 15 minutes)
- **CSV Parser**: Parses bank CSV exports into structured loan data
- **Plug & Play**: When real Andbank SFTP is ready, just update environment variables - no code changes needed!

## 📋 Prerequisites

1. **Notion Integration**:
   - Create an internal integration at https://www.notion.so/my-integrations
   - Copy the integration token
   - Create a database with these properties:
     - `Financing Institution` (Text)
     - `Entity` (Text)
     - `Credit Line Amount` (Number)
     - `Available Credit` (Number)
     - `Interest Rate` (Number)
     - `Last Sync` (Date)
   - Share the database with your integration
   - Copy the database ID from the URL

2. **Environment Variables**:
   ```bash
   NOTION_TOKEN=your_integration_token
   # Optional single database
   NOTION_DATABASE_ID=your_database_id
   # Recommended when you have multiple banks (comma or JSON)
   NOTION_DATABASE_MAPPING={"Andbank":"db-id","Caixa":"db-id","HSBC":"db-id","YesBank":"db-id"}
   DATA_SOURCE=sftp        # sftp | mock-sftp | mock-http
   SFTP_HOST=localhost
   SFTP_PORT=2222
   SFTP_USERNAME=andbank
   SFTP_PASSWORD=sftp-test
   SFTP_REMOTE_PATH=/loans.csv
   AUTO_START_MOCK_SFTP=true   # Auto-spawn mock server locally
   SYNC_INTERVAL_MINUTES=15    # Auto-sync interval (0 = run once)
   ```

## 🚀 Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Notion credentials
   ```

3. **Start mock SFTP server** (in one terminal) — optional when `AUTO_START_MOCK_SFTP=true`:
   ```bash
   npm run mock-sftp
   ```
   This starts an SFTP server on port 2222 serving `data/loans.csv`

4. **Run sync worker** (in another terminal):
   - **One-time sync**: `npm run sync`
   - **Auto-sync every 15 minutes**: `npm run sync:loop`
   
   The worker will connect to SFTP, download the CSV, parse it, and update Notion.

5. **Edit test data** (optional):
   - Edit `data/loans.csv` to test different scenarios
   - The sync will pick up changes on the next run

## 🌐 Deploy to Render

**Option 1: Use `render.yaml` (Recommended)**
1. Push your code to GitHub
2. In Render dashboard, create a new "Blueprint" and connect your repo
3. Render will automatically create all services from `render.yaml`
4. Set `NOTION_TOKEN` and `NOTION_DATABASE_ID` in the sync worker's environment variables

**Option 2: Manual Setup**

1. **Deploy Mock SFTP Server**:
   - Create a new Web Service
   - Build: `npm install && npm run build`
   - Start: `npm run mock-sftp`
   - Port: 2222

2. **Deploy Sync Worker**:
   - Create a new Background Worker
   - Build: `npm install && npm run build`
   - Start: `npm run sync:loop` (for auto-sync every 15 minutes)
   - Environment variables:
     - `NOTION_TOKEN`: Your Notion integration token
     - `NOTION_DATABASE_ID`: Your database ID
     - `DATA_SOURCE=sftp`
     - `SFTP_HOST`: Hostname of mock SFTP server
     - `SFTP_PORT=2222`
     - `SFTP_USERNAME=andbank`
     - `SFTP_PASSWORD=sftp-test`
    - `SFTP_REMOTE_PATH=/loans.csv`
    - `AUTO_START_MOCK_SFTP=false` (true only when using local mock)
     - `SYNC_INTERVAL_MINUTES=15`

## 🔄 Connect Real Andbank SFTP

When you get real Andbank SFTP credentials, it's **plug & play** - no code changes needed!

1. Update environment variables in Render:
   - `SFTP_HOST`: Real Andbank SFTP hostname
   - `SFTP_PORT`: Real SFTP port (usually 22)
   - `SFTP_USERNAME`: Your Andbank SFTP username
   - `SFTP_PASSWORD`: Your Andbank SFTP password (or use SSH key)
   - `SFTP_REMOTE_PATH`: Path to the CSV file on their server (e.g., `/exports/loans.csv`)

2. That's it! The sync worker will automatically use the real SFTP connection.

**Note**: If Andbank uses SSH keys instead of passwords, you can update `src/sync-worker/fetcher.ts` to use key-based authentication.

## 📊 Data Structure

Each loan record contains:
- `financingInstitution`: Bank name (e.g., "Andbank")
- `entity`: Company/individual name
- `creditLineAmount`: Total credit line (EUR)
- `availableCredit`: Remaining available credit (EUR)
- `interestRate`: Interest rate (%)

## 🛠️ Scripts

- `npm run dev` - Run sync worker in watch mode
- `npm run build` - Build TypeScript to JavaScript
- `npm run mock-sftp` - Start mock SFTP server (mimics real bank SFTP)
- `npm run mock-bank` - Start mock HTTP API server (alternative testing)
- `npm run sync` - Run one-time sync to Notion
- `npm run sync:loop` - Run sync and then auto-sync every N minutes (set `SYNC_INTERVAL_MINUTES`)
- `npm run find-db` - Find your Notion databases
- `npm run schema` - Check your Notion database schema

## 📝 Notes

- **Auto-sync**: Set `SYNC_INTERVAL_MINUTES=15` to sync every 15 minutes automatically
- **Upsert logic**: Creates new pages or updates existing ones based on Entity name
- **Rate limiting**: 100ms delay between Notion API calls
- **Test data**: Edit `data/loans.csv` to test different scenarios
- **CSV format**: The CSV should match the structure in `data/loans.csv` (Financing Institution, Entity, Credit Line Amount, Available Credit, Interest Rate)
- **Mock SFTP**: The mock SFTP server serves files from the `data/` directory - perfect for testing before connecting to real bank SFTP

