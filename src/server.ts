// src/server.ts

import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors'; 
import { startEmailSynchronization, esClient } from './services/EmailService.ts';
import { initializeVectorStore } from './services/VectorStoreService.ts';
import { suggestReply } from './services/AISuggestionService.ts'; 

const app = express();
const PORT = 3001;

// Configure CORS (Ensure 'npm install cors @types/cors' has been run)
app.use(cors()); 
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.send('ReachInbox Backend Assignment Server is Running!');
});

/**
 * Endpoint for fetching, searching, and filtering emails (Point 5)
 */
/**
 * Endpoint for fetching, searching, and filtering emails (Point 5)
 */
app.get('/emails', async (req: Request, res: Response) => {
    try {
        // Ensure the client is initialized before querying
        if (!esClient) {
            return res.status(503).json({ error: "Elasticsearch client not initialized. Synchronization may be starting up." });
        }

        // Get query parameters for Search and Filter (Added: category, page, limit)
        const { q, account, folder, category, page = '1', limit = '10' } = req.query;

        // Parse pagination params
        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 10;
        const from = (pageNum - 1) * limitNum;

        // Build the Elasticsearch Query (Must Array)
        const must: any[] = [];
        
        // 1. Search (Full-text query on subject and body)
        if (q && typeof q === 'string' && q.trim()) {
            must.push({
                multi_match: {
                    query: q.trim(),
                    fields: ['subject', 'body'],
                    fuzziness: 'AUTO' 
                }
            });
        }

        // 2. Filters (Term/Keyword matching) - Added: category filter
        if (account && typeof account === 'string') {
            must.push({ term: { account: account } });
        }
        if (folder && typeof folder === 'string') {
            must.push({ term: { folder: folder } });
        }
        if (category && typeof category === 'string') {
            must.push({ term: { category: category } });
        }
        
        // If 'must' is empty, use match_all, otherwise use the bool query
        const queryBody = must.length > 0 ? { bool: { must: must } } : { match_all: {} };

        // TypeScript now knows esClient is not null because of the check above
        const result: any = await esClient.search({
            index: 'emails',
            from: from,  // Added: Pagination offset
            size: limitNum,  // Added: Dynamic size
            query: queryBody,
            sort: [
                { 'date': { order: 'desc' } }
            ]
        });

        let totalCount = 0;
        const totalHits = result.hits.total;
        
        if (totalHits !== undefined) {
            totalCount = typeof totalHits === 'number' ? totalHits : totalHits.value;
        }

        const emails = result.hits.hits.map((hit: any) => ({
            id: hit._id,
            ...hit._source
        }));

        res.json({
            total: totalCount,
            limit: limitNum,  // Use dynamic limit
            emails: emails
        });

    } catch (error) {
        console.error("Error fetching emails from Elasticsearch:", error);
        res.status(500).json({ error: "Failed to retrieve emails from the database." });
    }
});

/**
 * Endpoint for generating AI Suggested Replies (Point 6)
 */
app.post('/api/emails/:id/suggest-reply', async (req: Request, res: Response) => {
    const emailId = req.params.id; 

    try {
        // FIX: Re-check esClient before usage to satisfy TypeScript's strict null checks
        if (!esClient) {
            return res.status(503).json({ error: "Elasticsearch client not initialized." });
        }

        // 1. Fetch the email body from Elasticsearch
        const result: any = await esClient.get({ // No more error here due to the check above
            index: 'emails',
            id: emailId
        });

        const emailBody = result._source?.body as string | undefined;

        if (!emailBody) {
            return res.status(404).json({ error: "Email not found or body is missing." });
        }

        // 2. Generate the suggested reply using the RAG service
        console.log(`Generating AI reply suggestion for email ID: ${emailId}`);
        const suggestion = await suggestReply(emailBody);

        res.json({ 
            suggestion: suggestion
        });

    } catch (error) {
        console.error(`Error generating suggested reply for ID ${emailId}:`, error);
        res.status(500).json({ error: "Failed to generate AI reply suggestion. Check Ollama server logs." });
    }
});


app.listen(PORT, async () => {
    console.log(` Server running on http://localhost:${PORT}`);
    
    // ----------------------------------------------------------------
    // CRITICAL AUTO-STOP IMPLEMENTATION & INITIALIZATION
    // ----------------------------------------------------------------
    try {
        // Initialize Vector Store (RAG context)
        await initializeVectorStore();
        console.log("Vector store initialization complete.");

        // START SYNCHRONIZATION and AWAIT its completion
        await startEmailSynchronization();

        // If this line is reached, the initial 30-day sync for ALL accounts is done.
        console.log(" Initial 30-day sync complete for all accounts. Shutting down Node.js process automatically.");
        
        // Stop the process cleanly
        process.exit(0); 

    } catch (error) {
        console.error(" Fatal error during initial setup or synchronization. Shutting down server:", error);
        
        // Stop the process with a failure code
        process.exit(1); 
    }
    // ----------------------------------------------------------------
});
