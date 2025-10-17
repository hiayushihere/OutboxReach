# ReachInbox AI Sales Dashboard

**ReachInbox** is a full-stack, privacy-focused email intelligence system built for B2B sales professionals and job seekers.  
It automates email synchronization, categorizes leads using local AI models, and delivers real-time notifications for high-value opportunities — all while ensuring complete data privacy.

---

## Overview

ReachInbox is designed to reduce inbox noise and prioritize meaningful leads. It automatically syncs multiple IMAP accounts, classifies emails using local large language models (LLMs), and triggers real-time alerts for potential opportunities.  
All AI processing is handled locally using Ollama, and Elasticsearch provides high-speed search and filtering.

**Core Mission:** Noise reduction, lead prioritization, and privacy-first automation.

---

## Core Features

### 1. Multi-Account Email Synchronization
- Syncs unseen emails from multiple IMAP accounts (e.g., Gmail, Outlook).
- Performs historical backfill (last 30 days).
- Monitors in near real-time using rate-limit-safe protocols.
- Uses application-specific passwords for secure access.

### 2. AI-Powered Email Categorization
Each incoming email is classified using a local LLM (Phi-3) into one of six categories:

- Interested (High Priority)  
- Meeting Booked (Confirmed Action)  
- Not Interested  
- Out of Office  
- Spam (Aggressive filter for promotions/off-topic mail)  
- Uncategorized  

This ensures only the most relevant emails are surfaced.

### 3. Elasticsearch Search and Filtering
- Full-text search across subject and body.  
- Structured filters by Category, Account, and Folder.  
- Dynamic pagination (10 emails per page).  
- Sorted by date for recent and relevant results.

### 4. AI-Generated Reply Suggestions
- Generates short, contextual replies for “Interested” leads.  
- Uses a Retrieval-Augmented Generation (RAG) pipeline for accuracy.  
- Ensures quick, professional responses with contextual relevance.

### 5. Real-Time Notifications
Automatically triggers notifications for “Interested” emails:
- Slack messages with formatted details.  
- Webhook triggers for CRM or other external tools.

### 6. Responsive Frontend Dashboard
- Built with Vanilla JavaScript and Tailwind CSS.  
- Real-time updates and responsive design.  
- Color-coded category badges.  
- Dedicated modal for AI-generated reply suggestions.

The user interface is a single-page application built with vanilla JavaScript and Tailwind CSS...



**Screenshot : AI Reply Suggestion Modal**
!<img width="1467" height="837" alt="Screenshot 2025-10-17 at 12 52 49 PM" src="https://github.com/user-attachments/assets/08f1e6a0-5aff-456d-82ba-4260112ded50" />


---

## Architecture

    ┌────────────────────────┐
    │   Email Providers (IMAP)│
    └────────────┬───────────┘
                 │
      Ingestion Layer (Sync)
                 │
    ┌────────────▼────────────┐
    │ Processing Layer (LLM + │
    │  RAG + Categorization)  │
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │ Persistence Layer       │
    │ (Elasticsearch Indexing)│
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │ API Layer (Node/Express)│
    └────────────┬────────────┘
                 │
    ┌────────────▼────────────┐
    │ Frontend (HTML + JS +   │
    │ Tailwind Dashboard)     │
    └─────────────────────────┘

### Layer Description

| Layer | Description |
|-------|--------------|
| **Ingestion** | Connects to email providers via IMAP and retrieves new messages. |
| **Processing** | Uses LLMs (Phi-3) and RAG for categorization and reply generation. |
| **Persistence** | Indexes and stores data in Elasticsearch for fast querying. |
| **API** | Node.js/Express layer for handling HTTP requests and query logic. |
| **Presentation** | Frontend dashboard built with HTML, JavaScript, and Tailwind CSS. |

---


---


## Setup Instructions
### Step 1: Prerequisites
Install the following before proceeding:
Node.js
Docker
Ollama


Clone the repository and install dependencies:
`git clone https://github.com/hiayushihere/OutboxReach`
`cd OutboxReach`
`npm install`


### Step 2: Configure Environment Variables
Create a .env file in the root directory and add the following:
*IMAP Credentials (App Passwords recommended)*
`EMAIL_1_USER=youremail1@example.com`
`EMAIL_1_PASSWORD=yourapppassword1`
`EMAIL_2_USER=youremail2@example.com`
`EMAIL_2_PASSWORD=yourapppassword2`

*Backend Services*
`ELASTIC_HOST=http://localhost:9200`
`OLLAMA_HOST=http://localhost:11434`

*Notification Webhooks*
`SLACK_WEBHOOK_URL=https://hooks.slack.com/...`
`GENERIC_WEBHOOK_URL=https://yourwebhook.url`


### Step 3: Start Core Services
*Start Elasticsearch (Data Store):*

`docker run -d --name elasticsearch \`
    `-p 9200:9200 \`
    
   ` -e "xpack.security.enabled=false" \`
    `-e "xpack.security.transport.ssl.enabled=false" \`
    `-e "discovery.type=single-node" \`
    `docker.elastic.co/elasticsearch/elasticsearch:8.10.0`
    
  
*Start Ollama (AI Engine):*

`ollama serve`

`ollama pull phi3`

`ollama pull nomic-embed-text`


### Step 4: Run the Application

*Start the backend API:*

`npm run dev`               #The backend runs on: http://localhost:3001


*Open the frontend:*


Open the index.html file in your browser to access the dashboard.


