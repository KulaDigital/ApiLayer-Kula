# Greeto Chatbot API

A production-ready Node.js + Express backend for the Greeto chat widget. Integrates OpenAI for intelligent conversations, Supabase for persistent storage, and supports multi-client deployments with API key authentication.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## ✨ Features

### Core Functionality
- **Multi-client Support**: Isolated data per client with API key authentication
- **AI-Powered Conversations**: OpenAI GPT-4O Mini integration for intelligent responses
- **Vector Search**: Semantic similarity search using embeddings for contextual answers
- **Conversation History**: Persistent message storage with retrieval capabilities
- **Web Scraping**: Multi-format support (HTML, XML, JSON) for knowledge base ingestion
- **Widget Configuration**: Customizable chat widget with branding options
- **Admin Panel**: Client management, API key generation, and configuration

### Security
- API key-based authentication for all protected routes
- Client-level data isolation at database query level
- Service role authentication with Supabase
- Status validation for active/inactive clients

### Performance
- Memory optimization (4GB heap with garbage collection)
- Rate limiting for OpenAI API calls (500 RPM conservative limit)
- Batch processing for embeddings
- Vector caching and similarity optimization

## 🛠 Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Node.js | v18+ |
| **Framework** | Express.js | ^4.18.2 |
| **Database** | Supabase (PostgreSQL + pgvector) | ^2.89.0 |
| **AI/ML** | OpenAI API | ^6.15.0 |
| **HTTP Client** | Axios | ^1.13.2 |
| **Web Scraping** | Cheerio + xml2js | ^1.1.2 / ^0.6.2 |
| **Environment** | dotenv | ^17.2.3 |
| **CORS** | cors | ^2.8.5 |
| **Database Driver** | pg | ^8.16.3 |

## 📦 Prerequisites

Before you begin, ensure you have:

- **Node.js** v18 or higher
- **npm** or **yarn** package manager
- **Supabase** account with a project
- **OpenAI API** key (GPT-4O Mini access)
- **.env file** with required environment variables

## 🚀 Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd node-chatbot-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory (see [Configuration](#configuration) section)

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server Configuration
PORT=5001

# Widget Configuration (Optional)
WIDGET_URL=http://localhost:3000/widget.js
```

### Environment Variables Explained

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key for GPT-4O Mini model | ✅ Yes |
| `SUPABASE_URL` | Your Supabase project URL | ✅ Yes |
| `SUPABASE_SERVICE_KEY` | Service role key for server-side authentication | ✅ Yes |
| `PORT` | Server port (default: 5001) | ❌ No |
| `WIDGET_URL` | URL to widget.js for embed script generation | ❌ No |

## 🏃 Running the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```
Uses **nodemon** to automatically restart on file changes.

### Production Mode
```bash
npm start
```
Optimized with 4GB memory allocation and garbage collection exposure.

### Server Output
Once started, you'll see:
```
🚀 Server running on port 5001
📊 Health check: http://localhost:5001/health
🎨 Widget config: http://localhost:5001/api/widget/config
👨‍💼 Admin panel: http://localhost:5001/api/admin/clients
```

## 📡 API Endpoints

### Health & Status

#### GET `/health`
Server health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Server is running"
}
```

---

### Widget Configuration (No Auth Required)

#### GET `/api/widget/config`
Fetch widget configuration using API key in header.

**Headers:**
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Response:**
```json
{
  "success": true,
  "client_name": "Acme Corp",
  "widget_config": {
    "primary_color": "#2563EB",
    "secondary_color": "#1E40AF",
    "position": "bottom-right",
    "welcome_message": "Hi! How can we help you today?"
  }
}
```

**Status Codes:**
- `200` - Configuration retrieved successfully
- `400` - Missing API key in header
- `401` - Invalid API key
- `403` - Client account not active

---

### Chat Endpoints (Auth Required)

#### POST `/api/chat`
Send a message and receive an AI-powered response.

**Headers:**
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "message": "What are your business hours?",
  "visitorId": "visitor-123"
}
```

**Response:**
```json
{
  "success": true,
  "conversationId": "conv-uuid",
  "visitorId": "visitor-123",
  "reply": "Our business hours are Monday-Friday, 9AM-5PM EST.",
  "messageId": "msg-uuid",
  "createdAt": "2026-01-18T10:30:00Z"
}
```

---

#### GET `/api/chat/history/:conversationId`
Fetch conversation history.

**Headers:**
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Response:**
```json
{
  "conversationId": "conv-uuid",
  "visitorId": "visitor-123",
  "status": "active",
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "What are your business hours?",
      "created_at": "2026-01-18T10:30:00Z"
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": "Our business hours are Monday-Friday, 9AM-5PM EST.",
      "created_at": "2026-01-18T10:31:00Z"
    }
  ]
}
```

---

### Web Scraping Endpoints (Auth Required)

#### POST `/api/scraper/scrape`
Scrape content from URLs and store in knowledge base.

**Headers:**
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://example.com/help",
  "contentType": "html"
}
```

**Supported Content Types:** `html`, `xml`, `json`

**Response:**
```json
{
  "success": true,
  "chunks": 15,
  "message": "Content scraped and stored successfully"
}
```

---

### Embeddings Endpoints (Auth Required)

#### POST `/api/embeddings/generate`
Generate embeddings for content chunks.

**Headers:**
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "texts": ["What are your hours?", "Contact us for support"]
}
```

**Response:**
```json
{
  "success": true,
  "embeddings": [
    [0.1, 0.2, 0.3, ...],
    [0.4, 0.5, 0.6, ...]
  ],
  "model": "text-embedding-3-small"
}
```

---

### Vector Search Endpoints (Auth Required)

#### POST `/api/search`
Search for similar content using semantic similarity.

**Headers:**
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "How do I contact support?",
  "matchThreshold": 0.5,
  "matchCount": 5
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "chunk-1",
      "url": "https://example.com/contact",
      "page_title": "Contact Us",
      "text": "Email us at support@example.com",
      "similarity": 0.87
    }
  ]
}
```

---

### Admin Endpoints

#### POST `/api/admin/clients`
Create a new client with auto-generated API key.

**Request Body:**
```json
{
  "company_name": "Acme Corp",
  "website_url": "https://acme.com",
  "widget_config": {
    "primary_color": "#FF0000",
    "position": "bottom-left"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Client created successfully",
  "client": {
    "id": "client-uuid",
    "company_name": "Acme Corp",
    "website_url": "https://acme.com",
    "api_key": "greeto-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "widget_config": { ... },
    "embed_script": "<script src=\"http://localhost:3000/widget.js\" data-api-key=\"greeto-xxx\"></script>",
    "install_instructions": "1. Copy the embed script...",
    "created_at": "2026-01-18T10:30:00Z"
  }
}
```

---

#### GET `/api/admin/clients`
List all clients (paginated).

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10)

**Response:**
```json
{
  "success": true,
  "clients": [ ... ],
  "total": 42,
  "page": 1,
  "limit": 10
}
```

---

#### PUT `/api/admin/clients/:id`
Update client information.

**Request Body:**
```json
{
  "company_name": "Acme Corp Updated",
  "widget_config": {
    "welcome_message": "Welcome to Acme!"
  }
}
```

---

#### DELETE `/api/admin/clients/:id`
Deactivate a client account.

**Response:**
```json
{
  "success": true,
  "message": "Client deactivated successfully"
}
```

---

#### GET `/api/admin/clients/:id/stats`
Get usage statistics for a client.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalConversations": 150,
    "totalMessages": 1230,
    "contentChunks": 342,
    "chunksWithEmbeddings": 342,
    "lastActivity": "2026-01-18T10:30:00Z"
  }
}
```

---

## 🔐 Authentication

All endpoints except `/health` and `/api/widget/config` require API key authentication.

### API Key Format
```
greeto-{32-character-hex-string}
```

### How to Authenticate
Include the API key in the request header:
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### How to Get an API Key
1. Call `POST /api/admin/clients` to create a new client
2. The response includes a unique API key
3. Use this key for all subsequent requests

### API Key Security
- Keys are stored securely in Supabase
- Never commit API keys to version control
- Rotate keys regularly for active clients
- Deactivate clients to revoke all their keys

---

## 📁 Project Structure

```
node-chatbot-api/
├── src/
│   ├── app.js                          # Express server initialization
│   ├── config/
│   │   └── database.js                 # Supabase client setup
│   ├── middleware/
│   │   └── apiKey.js                   # API key authentication
│   ├── routes/
│   │   ├── chatRoutes.js               # Chat conversation endpoints
│   │   ├── widgetRoutes.js             # Widget configuration
│   │   ├── adminRoutes.js              # Client management
│   │   ├── scraperRoutes.js            # Web scraping
│   │   ├── embeddingRoutes.js          # Vector generation
│   │   └── searchRoutes.js             # Vector search
│   ├── services/
│   │   ├── openaiService.js            # OpenAI integration
│   │   ├── vectorSearchService.js      # Vector search logic
│   │   ├── scraperService.js           # Web scraping logic
│   │   └── chunkingService.js          # Content chunking
│   ├── utils/
│   │   ├── apiKeyGenerator.js          # Unique key generation
│   │   ├── embedScriptGenerator.js     # Installation scripts
│   │   └── memoryManager.js            # Memory optimization
│   └── data/
│       └── kula_scraped_chunks.json    # Sample knowledge base
├── .env                                # Environment variables (not in git)
├── .gitignore                          # Git exclusions
├── package.json                        # Dependencies configuration
└── README.md                           # This file
```

### File Descriptions

- **app.js**: Main Express application with route registration and middleware setup
- **database.js**: Initializes Supabase client with connection testing
- **apiKey.js**: Middleware that validates API keys and injects client context
- **chatRoutes.js**: Handles message sending, vector search, and chat completions
- **widgetRoutes.js**: Provides widget configuration for frontend embedding
- **adminRoutes.js**: CRUD operations for client management
- **scraperRoutes.js**: Accepts URLs and scrapes content
- **embeddingRoutes.js**: Generates embeddings for text chunks
- **searchRoutes.js**: Performs semantic vector similarity search
- **openaiService.js**: Wraps OpenAI API calls for chat and embeddings
- **vectorSearchService.js**: Supabase RPC calls for semantic search
- **scraperService.js**: HTML/XML/JSON parsing and chunking
- **chunkingService.js**: Content segmentation with overlap strategy
- **apiKeyGenerator.js**: Cryptographically secure key generation
- **embedScriptGenerator.js**: Generates embed code for clients

---

## 🗄️ Database Schema

### Tables

#### `clients`
Stores client/company information and configuration.
```sql
id (UUID, Primary Key)
company_name (VARCHAR)
website_url (VARCHAR)
api_key (VARCHAR, Unique, Indexed)
widget_config (JSONB)
status (VARCHAR: 'active' | 'inactive')
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### `conversations`
Stores chat conversations per client.
```sql
id (UUID, Primary Key)
client_id (UUID, Foreign Key)
visitor_id (VARCHAR)
status (VARCHAR: 'active' | 'closed')
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### `messages`
Stores individual messages in conversations.
```sql
id (UUID, Primary Key)
conversation_id (UUID, Foreign Key)
role (VARCHAR: 'user' | 'assistant')
content (TEXT)
created_at (TIMESTAMP)
```

#### `content_chunks`
Stores scraped content with embeddings.
```sql
id (UUID, Primary Key)
client_id (UUID, Foreign Key)
url (VARCHAR)
page_title (VARCHAR)
chunk_text (TEXT)
embedding (vector, 1536-dimensional)
chunk_order (INTEGER)
created_at (TIMESTAMP)
```

### Vector Similarity Function (RPC)

#### `search_similar_chunks`
PostgreSQL function for semantic similarity search.
```sql
Parameters:
  - match_client_id (UUID)
  - query_embedding (vector)
  - match_threshold (FLOAT, 0-1)
  - match_count (INTEGER)

Returns: Similar chunks ranked by similarity score
```

---

## 💻 Development

### Running Tests
Currently, no tests are configured. To add tests:
```bash
npm install --save-dev jest supertest
# Create tests in __tests__/ directory
npm test
```

### Code Quality
To maintain code quality, consider adding:
```bash
npm install --save-dev eslint prettier
npx eslint src/
npx prettier --write src/
```

### Adding New Routes
1. Create a new file in `src/routes/`
2. Export an Express router
3. Import and mount in `app.js` with appropriate middleware

### Adding New Services
1. Create a new file in `src/services/`
2. Export functions or classes
3. Import in routes/middleware as needed

### Debugging
- Set `DEBUG=*` environment variable for verbose logging
- Check console output for timestamps and emoji indicators (✅, ❌, 🔍, etc.)
- Monitor Supabase logs for database errors
- Check OpenAI usage and errors in OpenAI dashboard

---

## 🐛 Troubleshooting

### Issue: "Missing Supabase environment variables"
**Solution:** Ensure `.env` file contains `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

### Issue: "Supabase connection failed"
**Solution:** 
- Verify credentials are correct
- Check Supabase project status
- Ensure service key has database access

### Issue: "Invalid or inactive API key"
**Solution:**
- Verify API key format starts with `greeto-`
- Check if client status is 'active'
- Create a new client if needed

### Issue: "OpenAI API Error"
**Solution:**
- Verify `OPENAI_API_KEY` is valid
- Check OpenAI account has sufficient credits
- Review OpenAI rate limits
- Check temperature and max_tokens parameters

### Issue: High memory usage
**Solution:**
- Restart with larger heap: `npm run dev` sets 4GB
- Check for memory leaks in vector search
- Implement pagination for large datasets

### Issue: Slow vector search
**Solution:**
- Add database index on `embedding` column
- Reduce `matchCount` parameter
- Increase `matchThreshold` to filter low-quality matches
- Consider caching frequent queries

---

## 📝 License

This project is for learning and experimentation purposes only.

## 👤 Author

Created as part of the Greeto chatbot widget project.

## 📞 Support

For issues or questions, refer to:
- Supabase Documentation: https://supabase.com/docs
- OpenAI API Docs: https://platform.openai.com/docs
- Express.js Guide: https://expressjs.com
