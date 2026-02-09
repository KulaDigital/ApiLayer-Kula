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
- [Git Workflow & Contributing](#git-workflow--contributing)
- [Troubleshooting](#troubleshooting)

## 🌿 Git Workflow & Contributing

### Branch Strategy

This repository follows a structured Git workflow to maintain code quality and stability:

- **`main` branch**: Production-ready code only
  - Represents the currently deployed production version
  - Protected branch - only merge via PRs after deployment verification
  - All code on `main` should be stable and tested

- **`dev` branch**: Development integration branch
  - Contains the latest development features and fixes
  - Staging ground for features before production deployment
  - All feature PRs must target this branch

### Contributing Guidelines

1. **Create a Feature Branch**
   - Always create a new branch from the `dev` branch
   - Use naming convention: `feature/<feature-name>` or `fix/<bug-name>`
   - Example: `feature/user-authentication`, `fix/chat-response-delay`
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature-name
   ```

2. **Commit Your Changes**
   - Make meaningful, atomic commits
   - Write clear commit messages describing the changes

3. **Create a Pull Request**
   - Push your feature branch to the repository
   - Create a PR targeting the `dev` branch (not `main`)
   - Include a detailed description of your changes
   - Request code review from team members
   - PR must be approved before merging

4. **Merge to Dev**
   - After PR approval, merge into the `dev` branch
   - Delete the feature branch after merging

5. **Deployment to Production**
   - When ready for production release, create a PR from `dev` to `main`
   - Perform final testing on the `dev` branch
   - After verification, merge the tested code into `main`
   - Only production-ready code should ever reach `main`

### Workflow Diagram
```
feature/xyz → PR → dev → PR → main (Production)
             ↑    ↑    ↑         ↑
           Dev  Dev  Deploy    Live
          Work  Test Release
```

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
- Hybrid authentication supporting both API keys and JWT Bearer tokens
- Role-based access control (super_admin vs client roles)
- Client-level data isolation at database query level
- Service role authentication with Supabase
- Status validation for active/inactive clients
- Row-Level Security (RLS) enforcement via Supabase for dashboard access

### Authentication Flexibility
- **API Key Auth** (X-API-Key): For widget and client API calls
- **Bearer Token Auth** (JWT): For dashboard and admin operations
- **Hybrid Support**: Chat and embedding endpoints accept both methods
- **Role-Based Control**: Different permissions for super_admin vs client roles

### Performance
- Memory optimization (4GB heap with garbage collection)
- Rate limiting for OpenAI API calls (500 RPM conservative limit)
- Batch processing for embeddings
- Vector caching and similarity optimization
- Pagination support for large datasets

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

### Admin Client Management Endpoints

#### POST `/api/admin/clients`
Create a new client with auto-generated API key.

**Authentication:** Bearer JWT token (super_admin role required)

**Headers:**
```
Authorization: Bearer {jwt-token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "company_name": "Acme Corp",
  "website_url": "https://acme.com",
  "widget_config": {
    "primaryColor": "#FF0000",
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
    "id": 1,
    "company_name": "Acme Corp",
    "website_url": "https://acme.com",
    "api_key": "kula_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "widget_config": { ... },
    "status": "active",
    "created_at": "2026-01-30T10:00:00Z"
  },
  "embed_script": "<script src=\"http://localhost:3000/widget.js\" data-api-key=\"kula_xxx\"></script>",
  "instructions": "Add the embed_script to your website HTML"
}
```

**Status Codes:**
- `201` - Client created successfully
- `400` - Missing required fields
- `401` - Unauthorized
- `500` - Server error

---

#### GET `/api/admin/clients`
List all clients.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "count": 42,
  "clients": [
    {
      "id": 1,
      "company_name": "Acme Corp",
      "website_url": "https://acme.com",
      "api_key": "kula_xxx",
      "status": "active",
      "created_at": "2026-01-30T10:00:00Z",
      "embed_script": "<script ... />"
    },
    ...
  ]
}
```

---

#### GET `/api/admin/clients/:id`
Get single client with installation instructions.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "client": {
    "id": 1,
    "company_name": "Acme Corp",
    "website_url": "https://acme.com",
    "api_key": "kula_xxx",
    "status": "active",
    "embed_script": "<script ... />",
    "instructions": "Installation instructions...",
    "created_at": "2026-01-30T10:00:00Z"
  }
}
```

---

#### PUT `/api/admin/clients/:id`
Update client configuration.

**Authentication:** Bearer JWT token (super_admin role required)

**Request Body (all optional):**
```json
{
  "company_name": "Acme Corp Updated",
  "website_url": "https://newurl.com",
  "widget_config": { ... },
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Client updated successfully",
  "client": { ... }
}
```

---

#### DELETE `/api/admin/clients/:id`
Soft delete a client (set status to inactive). Also soft deletes associated user if one exists.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "message": "Client and associated user deactivated successfully",
  "client": {
    "id": 1,
    "status": "inactive",
    ...
  },
  "associatedUser": {
    "user_id": "...",
    "status": "inactive",
    ...
  }
}
```

**Note:** This is a soft delete. Records remain in database with status = inactive.

---

#### POST `/api/admin/clients/:id/regenerate-key`
Regenerate API key for a client.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "message": "API key regenerated successfully",
  "api_key": "kula_xxxxxxxxxxxxxxxxxxxxxxxx",
  "warning": "Update the embed script on the client website with the new API key"
}
```

---

#### GET `/api/admin/clients/:id/embed-script`
Get only the embed script for a client.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "client_name": "Acme Corp",
  "status": "active",
  "embed_script": "<script src=\"...\" data-api-key=\"...\"></script>",
  "instructions": "Installation instructions...",
  "example": "Example HTML code..."
}
```

---

#### GET `/api/admin/clients/status/active`
Get all active clients.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "status": "active",
  "count": 5,
  "clients": [ ... ]
}
```

---

#### GET `/api/admin/clients/status/inactive`
Get all inactive clients.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "status": "inactive",
  "count": 2,
  "clients": [ ... ]
}
```

---

#### GET `/api/admin/clients/status/:status`
Get clients by status (dynamic).

**Authentication:** Bearer JWT token (super_admin role required)

**Path Parameters:**
- `status` (string): `active` or `inactive`

**Response:**
```json
{
  "success": true,
  "status": "active",
  "count": 5,
  "clients": [ ... ]
}
```

---

#### GET `/api/admin/clients/with-subscriptions/:status`
Get all clients with their subscription details in a single call.

**Authentication:** Bearer JWT token (super_admin role required)

**Path Parameters:**
- `status` (string): `active` or `inactive` (default: `active`)

**Response:**
```json
{
  "success": true,
  "status": "active",
  "count": 5,
  "clients": [
    {
      "id": 1,
      "company_name": "Acme Corp",
      "website_url": "https://acme.com",
      "api_key": "sk_xxx...",
      "status": "active",
      "created_at": "2026-01-31T10:00:00Z",
      "subscription": {
        "id": 1,
        "plan": "professional",
        "period": "monthly",
        "status": "active",
        "is_trial": true,
        "started_at": "2026-01-31T10:00:00Z",
        "ends_at": "2026-03-02T10:00:00Z",
        "is_entitled": true
      }
    }
  ]
}
```

---

#### GET `/api/admin/clients/:client_id/conversations`
Fetch all conversations for a specific client with pagination and filtering.

**Authentication:** Bearer JWT token (super_admin can access any client, client role can only access their own)

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 100)
- `status` (string, optional): `active` or `closed`
- `sort` (string, default: `recent`): `recent` or `oldest`

**Response:**
```json
{
  "conversations": [
    {
      "id": 1,
      "client_id": 1,
      "visitor_id": "visitor-123",
      "status": "active",
      "message_count": 5,
      "created_at": "2026-01-31T10:00:00Z",
      "last_message_preview": "Thank you for contacting us...",
      "last_message_at": "2026-01-31T10:15:00Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_count": 25,
    "total_pages": 2,
    "limit": 20,
    "has_next": true,
    "has_previous": false
  }
}
```

---

### Subscription Management Endpoints (MVP)

#### POST `/api/admin/clients/:clientId/subscription`
Upsert (create or update) subscription for a client.

**Authentication:** Bearer JWT token (super_admin role required)

**Request Body:**
```json
{
  "plan": "professional | business | enterprise",
  "period": "monthly | yearly",
  "status": "active | inactive",
  "is_trial": false,
  "started_at": "2026-01-31T10:00:00Z",
  "ends_at": "2026-02-28T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription upserted successfully",
  "subscription": {
    "id": 1,
    "client_id": 1,
    "plan": "professional",
    "period": "monthly",
    "status": "active",
    "is_trial": false,
    "started_at": "2026-01-31T10:00:00Z",
    "ends_at": "2026-02-28T10:00:00Z",
    "is_entitled": true
  }
}
```

---

#### POST `/api/admin/clients/:clientId/subscription/cancel`
Cancel subscription for a client.

**Authentication:** Bearer JWT token (super_admin role required)

**Request Body (optional):**
```json
{
  "cancelType": "immediate | end-of-period"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription canceled successfully",
  "subscription": { ... }
}
```

---

#### GET `/api/admin/clients/:clientId/subscription`
Get subscription for a client.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": 1,
    "client_id": 1,
    "plan": "professional",
    "period": "monthly",
    "status": "active",
    "is_trial": true,
    "started_at": "2026-01-31T10:00:00Z",
    "ends_at": "2026-03-02T10:00:00Z",
    "is_entitled": true
  }
}
```

---

#### POST `/api/admin/webhooks/subscription-created`
Handle payment provider webhook for subscription creation (idempotent).

**Authentication:** No auth required (validate from payment provider)

**Request Body:**
```json
{
  "client_id": 1,
  "stripe_subscription_id": "sub_xxx",
  "plan": "professional",
  "period": "monthly",
  "starts_at": "2026-01-31T10:00:00Z",
  "ends_at": "2026-02-28T10:00:00Z",
  "is_trial": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription created from webhook",
  "subscription": { ... }
}
```

---

#### POST `/api/admin/webhooks/subscription-canceled`
Handle payment provider webhook for subscription cancellation (idempotent).

**Request Body:**
```json
{
  "client_id": 1,
  "cancel_type": "immediate | end-of-period"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription canceled from webhook",
  "subscription": { ... }
}
```

---

#### POST `/api/admin/jobs/expire-subscriptions`
Scheduled expiry job to mark expired subscriptions as inactive.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "message": "Expiry job completed",
  "updated_count": 3
}
```

---

### Lead Management Endpoints

#### POST `/api/leads`
Capture or upsert a lead from the chat widget.

**Authentication:** X-API-Key header OR Bearer token (hybrid auth)

**Request Body:**
```json
{
  "visitorId": "visitor-123",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1-234-567-8900",
  "company": "Acme Corp"
}
```

**Response:**
```json
{
  "success": true,
  "leadId": 1,
  "message": "Lead created/updated successfully",
  "lead": {
    "id": 1,
    "client_id": 1,
    "visitor_id": "visitor-123",
    "conversation_id": null,
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1-234-567-8900",
    "company": "Acme Corp",
    "status": "new",
    "created_at": "2026-01-31T10:00:00Z",
    "updated_at": "2026-01-31T10:00:00Z"
  }
}
```

**Status Codes:**
- `200` - Lead updated successfully
- `201` - Lead created successfully
- `400` - Validation error (missing required fields or invalid email)
- `401` - Invalid authentication
- `500` - Server error

---

#### GET `/api/leads`
List leads with filtering and pagination.

**Authentication:** X-API-Key header OR Bearer token

**Query Parameters:**
- `q` (string, optional): Search by name, email, or company
- `from` (ISO date string, optional): Filter by creation date (start)
- `to` (ISO date string, optional): Filter by creation date (end)
- `limit` (number, default: 20, max: 100)
- `offset` (number, default: 0)
- `sort` (string, default: `newest`): `newest` or `oldest`

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "visitor_id": "visitor-123",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1-234-567-8900",
      "company": "Acme Corp",
      "status": "new",
      "created_at": "2026-01-31T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

#### GET `/api/leads/:visitorId`
Get single lead by visitor ID (useful for widget initialization).

**Authentication:** X-API-Key header OR Bearer token

**Response:**
```json
{
  "success": true,
  "lead": {
    "id": 1,
    "visitor_id": "visitor-123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1-234-567-8900",
    "company": "Acme Corp",
    "status": "new",
    "conversation_id": 5,
    "created_at": "2026-01-31T10:00:00Z",
    "updated_at": "2026-01-31T10:00:00Z"
  }
}
```

**Status Codes:**
- `200` - Lead found
- `404` - Lead not found
- `401` - Invalid authentication
- `500` - Server error

---

#### PUT `/api/leads/:visitorId`
Update lead details (name, email, phone, company).

**Authentication:** X-API-Key header OR Bearer token

**Request Body (at least 1 field required):**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1-987-654-3210",
  "company": "New Company"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Lead updated successfully",
  "lead": { ... }
}
```

**Notes:**
- `status` and `conversation_id` cannot be changed via this endpoint (protected fields)
- Partial updates supported (provide only fields to change)

---

#### PUT `/api/leads/:visitorId/status`
Update lead status through the lifecycle.

**Authentication:** X-API-Key header OR Bearer token

**Request Body:**
```json
{
  "status": "new | contacted | qualified | won | lost"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Lead status updated successfully",
  "lead": { ... }
}
```

**Allowed Status Values:**
- `new`: Initial state (default)
- `contacted`: Sales has reached out
- `qualified`: Lead is sales-qualified
- `won`: Became a customer
- `lost`: Not pursuing

---

#### GET `/api/admin/leads`
Admin endpoint - view all leads across all clients.

**Authentication:** Bearer JWT token (super_admin role required)

**Query Parameters:**
- `clientId` (number, optional): Filter by specific client
- `q` (string, optional): Search query
- `from` (ISO date string, optional): Start date filter
- `to` (ISO date string, optional): End date filter
- `limit` (number, default: 20)
- `offset` (number, default: 0)

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "client_id": 1,
      "visitor_id": "visitor-123",
      "name": "John Doe",
      "email": "john@example.com",
      "status": "new",
      "created_at": "2026-01-31T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

### Authentication & User Profile Endpoints

#### GET `/api/me`
Get current user's profile and subscription status (requires valid Bearer token).

**Authentication:** Bearer JWT token

**Response:**
```json
{
  "role": "super_admin | client",
  "client_id": 1,
  "user_name": "John Doe",
  "subscription": {
    "plan": "professional",
    "period": "monthly",
    "status": "active",
    "is_trial": true,
    "started_at": "2026-01-31T10:00:00Z",
    "ends_at": "2026-03-02T10:00:00Z",
    "is_active": true
  },
  "has_subscription": true
}
```

---

#### GET `/api/client/me`
Get client-specific user profile and subscription (client role required).

**Authentication:** Bearer JWT token (client role required)

**Response:**
```json
{
  "role": "client",
  "client_id": 1,
  "subscription": { ... },
  "has_subscription": true
}
```

---

#### GET `/api/client/conversations`
Get all conversations for the logged-in client with pagination.

**Authentication:** Bearer JWT token (client role required)

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string, optional): `active` or `closed`
- `sort` (string, default: `recent`): `recent` or `oldest`

**Response:**
```json
{
  "conversations": [
    {
      "id": 1,
      "client_id": 1,
      "visitor_id": "visitor-123",
      "status": "active",
      "message_count": 5,
      "created_at": "2026-01-31T10:00:00Z",
      "last_message_preview": "Thank you...",
      "last_message_at": "2026-01-31T10:15:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

#### POST `/api/admin/users`
Create a new dashboard user.

**Authentication:** Bearer JWT token (super_admin role required)

**Headers:**
```
Authorization: Bearer {jwt-token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "company_name": "Acme Corp",
  "role": "super_admin",
  "user_name": "John Doe",
  "phone_number": "+1-234-567-8900"
}
```

**Notes:**
- `user_id`: Supabase Auth user ID (UUID)
- `company_name`: Must match existing client (auto-lookups client_id)
- `role`: Only `super_admin` or `client` allowed
- `phone_number`: Optional
- **One-to-one constraint:** Each client can only have one user

**Response:**
```json
{
  "success": true,
  "message": "Dashboard user created successfully",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "client_id": 1,
    "role": "super_admin",
    "user_name": "John Doe",
    "phone_number": "+1-234-567-8900",
    "status": "active",
    "created_at": "2026-01-30T10:30:00Z"
  }
}
```

**Status Codes:**
- `201` - User created successfully
- `400` - Invalid role or missing fields
- `404` - Company name not found
- `409` - Client already has a user assigned
- `500` - Server error

---

#### GET `/api/admin/users`
Get all dashboard users.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "count": 3,
  "users": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "client_id": 1,
      "role": "super_admin",
      "user_name": "John Doe",
      "phone_number": "+1-234-567-8900",
      "status": "active",
      "created_at": "2026-01-30T10:30:00Z"
    },
    ...
  ]
}
```

---

#### GET `/api/admin/users/:user_id`
Get a specific dashboard user.

**Authentication:** Bearer JWT token (super_admin role required)

**Path Parameters:**
- `user_id` (UUID): Dashboard user ID

**Response:**
```json
{
  "success": true,
  "user": { ... }
}
```

---

#### GET `/api/admin/users/client/:client_id`
Get the user assigned to a specific client (one-to-one relationship).

**Authentication:** Bearer JWT token (super_admin role required)

**Path Parameters:**
- `client_id` (number): Client ID

**Response (User Assigned):**
```json
{
  "success": true,
  "user": { ... }
}
```

**Response (No User Assigned):**
```json
{
  "success": true,
  "message": "No user assigned to this client",
  "user": null
}
```

---

#### PUT `/api/admin/users/:user_id`
Update dashboard user (role, name, phone).

**Authentication:** Bearer JWT token (super_admin role required)

**Request Body (all optional):**
```json
{
  "role": "client",
  "user_name": "Jane Doe",
  "phone_number": "+1-987-654-3210"
}
```

**Notes:**
- `role`: Only `super_admin` or `client` allowed
- At least one field required for update

**Response:**
```json
{
  "success": true,
  "message": "Dashboard user updated successfully",
  "user": { ... }
}
```

---

#### DELETE `/api/admin/users/:user_id`
Soft delete a dashboard user (set status to inactive). Also soft deletes associated client.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "message": "Dashboard user and associated client deactivated successfully",
  "user": {
    "user_id": "...",
    "status": "inactive",
    ...
  },
  "associatedClient": {
    "id": 1,
    "status": "inactive",
    ...
  }
}
```

**Note:** This is a soft delete. Records remain in database with status = inactive.

---

#### GET `/api/admin/users/status/active`
Get all active dashboard users.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "status": "active",
  "count": 5,
  "users": [ ... ]
}
```

---

#### GET `/api/admin/users/status/inactive`
Get all inactive dashboard users.

**Authentication:** Bearer JWT token (super_admin role required)

**Response:**
```json
{
  "success": true,
  "status": "inactive",
  "count": 2,
  "users": [ ... ]
}
```

---

#### GET `/api/admin/users/status/:status`
Get users by status (dynamic).

**Authentication:** Bearer JWT token (super_admin role required)

**Path Parameters:**
- `status` (string): `active` or `inactive`

**Response:**
```json
{
  "success": true,
  "status": "active",
  "count": 5,
  "users": [ ... ]
}
```

---

## 🔐 Authentication

The API supports three authentication methods depending on the use case and endpoint:

### 1. API Key Authentication (X-API-Key)

Used for public chat widget interactions and client API calls. This method isolates data per client using API key-based access.

#### API Key Format
```
greeto-{32-character-hex-string}
```

#### How to Authenticate
Include the API key in the request header:
```
X-API-Key: greeto-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Protected Endpoints
- `POST /api/chat` - Send chat messages
- `GET /api/chat/history/:conversationId` - Retrieve conversation history
- `POST /api/search` - Search knowledge base
- `POST /api/leads` - Capture leads
- `GET /api/leads/:visitorId` - Retrieve lead data
- All widget configuration endpoints

#### API Key Security
- Keys are stored securely in Supabase
- Never commit API keys to version control
- Rotate keys regularly for active clients
- Deactivate clients to revoke all their keys

---

### 2. Bearer Token Authentication (JWT)

Used for dashboard operations and admin access. Provides role-based access control with automatic Row Level Security (RLS) enforcement via Supabase.

#### Supported Roles
- **`super_admin`**: Full access to all dashboard functionality (all clients, all data)
- **`client`**: Restricted to own client data only (enforced by RLS)

#### How to Authenticate
Include the JWT token in the Authorization header:
```
Authorization: Bearer {your-jwt-token}
```

#### JWT Token Security

**Token Validation:**
- Every request validates JWT signature cryptographically
- Checks token expiration timestamp
- Confirms user still exists in Supabase Auth
- Detects revoked tokens

**Best Practices:**
- Store JWT tokens securely (HttpOnly cookies recommended for web apps)
- Refresh tokens before expiration
- Use HTTPS in production to prevent token interception
- Implement token rotation for long-lived sessions
- Never expose tokens in URL parameters or logs

#### Data Isolation & RLS
- Dashboard uses Supabase ANON_KEY with RLS enforcement
- Each user gets a per-request Supabase client with their JWT token
- RLS policies automatically restrict data access by role and client_id
- Server never exposes or returns raw database rows

---

### 3. Hybrid Authentication (API Key + Bearer Token)

Certain endpoints support **both** API key and Bearer token authentication. Priority is given to Bearer token if both are provided.

#### Endpoints with Hybrid Auth

**Chat Routes** (`/api/chat`, `/api/leads`):
- ✅ Widget/Client requests: Use `X-API-Key` header
- ✅ Dashboard requests: Use `Authorization: Bearer {token}` header

**Scraper Routes** (`/api/scraper/scrape-batch`, `/api/scraper/crawl-domain`):
- ✅ Client with Bearer token: Works (identifies client from dashboard_users)
- ✅ Client with X-API-Key: Works (identifies client from API key)
- ❌ Super admin with Bearer token: Fails (super admin has no client_id)
- ✅ Super admin with X-API-Key: Works (must create client first, then use its API key)

**Embedding Routes** (`/api/embeddings/generate`, `/api/embeddings/stats`):
- ✅ Client with Bearer token: Works (identified from dashboard_users)
- ✅ Client with X-API-Key: Works (identified from API key)
- ❌ Super admin with Bearer token: Fails (super admin has no client_id)
- ✅ Super admin with X-API-Key: Works (must use client's API key)

#### How Hybrid Auth Works

1. **Bearer Token (Priority 1)**
   - If `Authorization: Bearer {token}` header present
   - Validate token with Supabase Auth
   - Lookup user in `dashboard_users` table
   - Extract `role` and `client_id`
   - Set `req.userRole` and `req.clientId`

2. **API Key (Priority 2 - Fallback)**
   - If no Bearer token but `X-API-Key` header present
   - Validate API key against `clients` table
   - Extract `client_id` from matching client
   - Set `req.clientId` (no role information)

3. **Failure**
   - Return 401 if neither authentication method provided

---

#### Dashboard Endpoints (Bearer Token Only)

##### GET `/api/me`
Returns the authenticated user's profile information.

**Headers:**
```
Authorization: Bearer {jwt-token}
```

**Response:**
```json
{
  "role": "super_admin",
  "client_id": 123,
  "user_name": "John Doe"
}
```

**Status Codes:**
- `200` - User authenticated, profile retrieved
- `401` - Invalid or expired JWT token
- `403` - Token valid but no dashboard access configured

##### GET `/api/admin/me`
Admin-only endpoint. Returns admin user information.

**Headers:**
```
Authorization: Bearer {jwt-token}
```

**Requirements:**
- User must have `super_admin` role in `dashboard_users` table
- Validates JWT signature, expiration, and user existence

**Status Codes:**
- `200` - Admin authenticated
- `401` - Invalid token
- `403` - User lacks admin permissions

##### GET `/api/client/me`
Client-only endpoint. Returns client user information.

**Headers:**
```
Authorization: Bearer {jwt-token}
```

**Requirements:**
- User must have `client` role in `dashboard_users` table
- RLS applies: Users can only access their own client data

**Status Codes:**
- `200` - Client authenticated
- `401` - Invalid token
- `403` - User lacks client permissions

---

## 📁 Project Structure

```
node-chatbot-api/
├── src/
│   ├── app.js                          # Express server initialization
│   ├── config/
│   │   └── database.js                 # Supabase client setup
│   ├── middleware/
│   │   ├── apiKey.js                   # API key authentication (X-API-Key)
│   │   ├── dashboardAuth.js            # JWT Bearer token authentication
│   │   ├── hybridAuth.js               # ✅ NEW: Hybrid auth (Bearer + API key)
│   │   └── scraperAuth.js              # ✅ NEW: Scraper auth with role support
│   ├── routes/
│   │   ├── chatRoutes.js               # Chat conversation endpoints
│   │   ├── widgetRoutes.js             # Widget configuration
│   │   ├── adminRoutes.js              # Client & user management (+ subscriptions)
│   │   ├── authRoutes.js               # Authentication & /api/me endpoint
│   │   ├── clientRoutes.js             # Client dashboard routes
│   │   ├── leadRoutes.js               # ✅ NEW: Lead capture & retrieval
│   │   ├── leadAdminRoutes.js          # ✅ NEW: Lead admin endpoints
│   │   ├── scraperRoutes.js            # Web scraping
│   │   ├── embeddingRoutes.js          # Vector generation
│   │   └── searchRoutes.js             # Vector search
│   ├── services/
│   │   ├── openaiService.js            # OpenAI integration
│   │   ├── vectorSearchService.js      # Vector search logic
│   │   ├── scraperService.js           # Web scraping logic
│   │   ├── chunkingService.js          # Content chunking
│   │   ├── dashboardUsersService.js    # Dashboard user management
│   │   ├── leadsService.js             # ✅ NEW: Lead CRUD & validation
│   │   └── subscriptionService.js      # ✅ NEW: Subscription management
│   ├── utils/
│   │   ├── apiKeyGenerator.js          # Unique key generation
│   │   ├── embedScriptGenerator.js     # Installation scripts
│   │   └── memoryManager.js            # Memory optimization
│   └── data/
│       └── kula_scraped_chunks.json    # Sample knowledge base
├── migrations/
│   └── 001_create_leads_table.sql      # ✅ NEW: Lead table schema
├── .env                                # Environment variables (not in git)
├── .gitignore                          # Git exclusions
├── package.json                        # Dependencies configuration
├── API_DOCUMENTATION.md                # Complete API reference
├── FRONTEND_API_SUMMARY.md             # Frontend-focused API guide
├── LEAD_API_SUMMARY_FOR_FRONTEND.md    # ✅ NEW: Lead API guide for frontend
├── LEAD_UPDATE_ENDPOINT.md             # ✅ NEW: Lead update endpoint docs
├── LEAD_STATUS_UPDATE.md               # ✅ NEW: Lead status feature docs
├── ROLE_BASED_API_BEHAVIOR.md          # ✅ NEW: Role-based API behavior
├── EMBEDDING_BEARER_TOKEN_UPDATE.md    # ✅ NEW: Bearer token for embeddings
├── EMBEDDING_GENERATE_API.md           # ✅ NEW: Generate embeddings endpoint
└── README.md                           # This file
```

### File Descriptions

- **app.js**: Main Express application with route registration and middleware setup
- **database.js**: Initializes Supabase client with connection testing
- **apiKey.js**: Middleware that validates API keys and injects client context
- **dashboardAuth.js**: Middleware for JWT Bearer token validation and role-based access control
- **hybridAuth.js** (✅ NEW): Accepts both Bearer token and API key, priority to Bearer
- **scraperAuth.js** (✅ NEW): Bearer token + API key support with role-based role checking
- **chatRoutes.js**: Handles message sending, vector search, and chat completions
- **widgetRoutes.js**: Provides widget configuration for frontend embedding
- **adminRoutes.js**: CRUD operations for clients, users, and subscriptions
- **authRoutes.js**: Authentication and user profile endpoints
- **clientRoutes.js**: Client-specific dashboard routes
- **leadRoutes.js** (✅ NEW): Lead capture, retrieval, and updates via hybrid auth
- **leadAdminRoutes.js** (✅ NEW): Cross-client lead viewing for super_admin
- **scraperRoutes.js**: Accepts URLs and scrapes content
- **embeddingRoutes.js**: Generates embeddings for text chunks (with Bearer token support)
- **searchRoutes.js**: Performs semantic vector similarity search
- **openaiService.js**: Wraps OpenAI API calls for chat and embeddings
- **vectorSearchService.js**: Supabase RPC calls for semantic search
- **scraperService.js**: HTML/XML/JSON parsing and chunking
- **chunkingService.js**: Content segmentation with overlap strategy
- **dashboardUsersService.js**: Dashboard user CRUD and role validation
- **leadsService.js** (✅ NEW): 8 functions for lead CRUD, validation, status, and auto-linking
- **subscriptionService.js** (✅ NEW): Subscription CRUD, formatting, and webhook handling
- **apiKeyGenerator.js**: Cryptographically secure key generation
- **embedScriptGenerator.js**: Generates embed code for clients
- **001_create_leads_table.sql** (✅ NEW): Database schema with constraints and triggers

---

## 🗄️ Database Schema

### Tables

#### `clients`
Stores client/company information and configuration.
```sql
id (BIGINT, Primary Key)
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
id (BIGINT, Primary Key)
client_id (BIGINT, Foreign Key)
visitor_id (VARCHAR)
status (VARCHAR: 'active' | 'closed')
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
last_message_at (TIMESTAMP, Nullable)
```

#### `messages`
Stores individual messages in conversations.
```sql
id (BIGINT, Primary Key)
conversation_id (BIGINT, Foreign Key)
role (VARCHAR: 'user' | 'assistant')
content (TEXT)
created_at (TIMESTAMP)
```

#### `content_chunks`
Stores scraped content with embeddings.
```sql
id (BIGINT, Primary Key)
client_id (BIGINT, Foreign Key)
url (VARCHAR)
page_title (VARCHAR)
chunk_text (TEXT)
embedding (vector, 1536-dimensional)
chunk_order (INTEGER)
created_at (TIMESTAMP)
```

#### `leads` (✅ NEW)
Stores lead/prospect information captured from chat widget.
```sql
id (BIGINT, Primary Key)
client_id (BIGINT, Foreign Key, Indexed)
visitor_id (VARCHAR, Indexed)
conversation_id (BIGINT, Foreign Key, Nullable)
name (VARCHAR)
email (VARCHAR, Indexed)
phone (VARCHAR, Nullable)
company (VARCHAR, Nullable)
status (VARCHAR: 'new' | 'contacted' | 'qualified' | 'won' | 'lost', Default: 'new')
created_at (TIMESTAMP)
updated_at (TIMESTAMP, Auto-updated by trigger)

Constraints:
  - Unique: (client_id, visitor_id) - One lead per visitor per client
  - Foreign Keys with CASCADE/SET NULL to handle deletions
```

#### `client_subscriptions` (✅ NEW)
Stores subscription information for each client.
```sql
id (BIGINT, Primary Key)
client_id (BIGINT, Foreign Key, Unique)
plan (VARCHAR: 'professional' | 'business' | 'enterprise')
period (VARCHAR: 'monthly' | 'yearly')
status (VARCHAR: 'active' | 'inactive' | 'expired' | 'canceled' | 'pending_cancellation')
is_trial (BOOLEAN, Default: false)
started_at (TIMESTAMP)
ends_at (TIMESTAMP)
canceled_at (TIMESTAMP, Nullable)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

#### `dashboard_users`
Stores dashboard access for admin and client users.
```sql
user_id (UUID, Primary Key - Supabase Auth user ID)
client_id (BIGINT, Foreign Key, Nullable)
role (VARCHAR: 'super_admin' | 'client')
user_name (VARCHAR)
phone_number (VARCHAR, Nullable)
status (VARCHAR: 'active' | 'inactive')
created_at (TIMESTAMP)
updated_at (TIMESTAMP)

Constraints:
  - Unique: (client_id) - One user per client maximum
  - super_admin users have client_id = NULL
```

### Database Functions (RPC)

#### `search_similar_chunks`
PostgreSQL function for semantic similarity search.
```sql
Parameters:
  - match_client_id (BIGINT)
  - query_embedding (vector)
  - match_threshold (FLOAT, 0-1)
  - match_count (INTEGER)

Returns: Similar chunks ranked by similarity score
```

### Indexes

Key indexes for performance optimization:
```sql
- clients (api_key) - Fast API key lookup
- leads (client_id) - Fast lead filtering by client
- leads (visitor_id) - Fast lead lookup by visitor
- leads (email) - Fast lead lookup by email
- content_chunks (client_id) - Fast content filtering
- conversations (client_id) - Fast conversation filtering
- messages (conversation_id) - Fast message retrieval
- client_subscriptions (client_id) - Fast subscription lookup
```

### Triggers

#### Auto-update timestamp
Automatically updates `updated_at` timestamp when record changes:
```sql
- leads table
- conversations table
- messages table
- content_chunks table
```

#### Auto-link conversation to lead
When user sends first message in chat, automatically links conversation to existing lead if one exists (non-blocking, errors don't fail chat).

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
