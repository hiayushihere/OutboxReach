# ReachInbox AI Sales Dashboard

### Overview

ReachInbox is a powerful, full-stack email management dashboard engineered for B2B sales professionals and job seekers. The core mission is noise reduction and lead prioritization.

The system automates IMAP email synchronization from multiple accounts, leverages local Large Language Models (LLMs) running via Ollama for intelligent categorization, and uses Elasticsearch for rapid search and filtering. Critical "Interested" leads automatically trigger notifications via Slack and webhooks, ensuring no high-value opportunity is missed.

This project is built using TypeScript/Node.js (Express) for the backend and a static HTML/JS/Tailwind frontend, emphasizing privacy by running all AI inference locally.

### Core Features

ReachInbox delivers a robust set of features, each designed to streamline the sales and outreach workflow.

1. Multi-Account Email Synchronization

The system monitors and syncs unseen emails from two configured IMAP accounts (e.g., Gmail/Outlook). It performs an initial historical backfill (e.g., the last 30 days) and then monitors accounts in near real-time. This process uses robust protocols to avoid rate limits and ensures reliable connections, even utilizing application-specific passwords for enhanced security.

2. AI-Powered Email Categorization

Every new email is rigorously classified using a local LLM (Phi-3). The classification is highly aggressive in removing clutter, filtering emails into one of six categories:

Interested (High Priority)

Meeting Booked (Confirmed Action)

Not Interested

Out of Office

Spam (Aggressive filter for all promotions/off-topic mail)

Uncategorized

3. Elasticsearch Search and Filtering

The dashboard is backed by Elasticsearch for high-speed data retrieval. Users can instantly perform full-text searches across subject and body, or use a combination of structured filters (Category, Account, Folder) with dynamic pagination (10 emails per page). All data is returned sorted by date, ensuring the most recent and relevant emails are always prioritized.

4. AI-Generated Reply Suggestions

For high-priority "Interested" emails, the system provides concise, first-person reply drafts tailored to the specific content. This feature uses a Retrieval-Augmented Generation (RAG) approach to inject necessary context, such as scheduling links or relevant product information, ensuring responses are fast, accurate, and professional.

5. Real-Time Notifications

Immediate action is crucial for hot leads. The system triggers non-blocking, asynchronous alerts exclusively for emails categorized as "Interested":

Slack Messages: Sent to a configured channel with rich formatting.

Generic Webhooks: Sent to any configured URL for integration into external CRM or ticketing systems.

6. Responsive Frontend Dashboard

The user interface is a single-page application built with vanilla JavaScript and Tailwind CSS. It provides a clean, responsive view across all devices, featuring:

Real-time filtering and search updates.

Color-coded category badges.

A dedicated modal for viewing and copying AI-generated reply suggestions.

## Architecture

ReachInbox uses a modular, layered architecture that separates concerns for ingestion, processing, persistence, and presentation.

Ingestion Layer (IMAP): Connects to external email providers, retrieves new emails, and queues them for processing.

Processing Layer (LLM & Logic): Applies AI categorization via Ollama, performs RAG context retrieval, and determines notification triggers.

Persistence Layer (Elasticsearch): Indexes email data for rapid querying and storage.

API Layer (Node/Express): Handles all HTTP requests from the frontend, manages query logic, and interfaces with the Processing and Persistence layers.

Presentation Layer (Frontend): The static HTML/JS/Tailwind dashboard where users interact with the data and AI features.

## Setup Instructions

This project is configured for local development using Docker for the data store and Ollama for local AI inference.

Step 1: Install and Clone

Install Node.js, Docker, and Ollama (download from ollama.com).

Clone the repository and install dependencies:

git clone [https://github.com/hiayushihere/OutboxReach](https://github.com/hiayushihere/OutboxReach)
cd OutboxReach
npm install


Step 2: Environment Variables

Create a file named .env in the root directory and fill in your credentials:

# IMAP Credentials (Requires App Passwords for Gmail)
EMAIL_1_USER=...
EMAIL_1_PASSWORD=...
EMAIL_2_USER=...
EMAIL_2_PASSWORD=...

# Backend Services
ELASTIC_HOST=http://localhost:9200
OLLAMA_HOST=http://localhost:11434

# Notification Webhooks
SLACK_WEBHOOK_URL=...
GENERIC_WEBHOOK_URL=...


Step 3: Start Services

Start Elasticsearch (Data Store):

docker run -d --name elasticsearch \
    -p 9200:9200 \
    -e "discovery.type=single-node" \
    -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
    docker.elastic.co/elasticsearch/elasticsearch:7.17.0


Start Ollama (AI Engine):
Ensure the Ollama server is running and pull the necessary models:

ollama serve
ollama pull phi3  # For categorization/reply generation
ollama pull nomic-embed-text  # For RAG embeddings


Step 4: Run the Application

Start the Backend API:

npm run dev  # Starts the server on http://localhost:3001


Start the Frontend:
Simply open the index.html file in your web browser.
