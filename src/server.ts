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


app.use(cors()); 
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.send('ReachInbox Backend Assignment Server is Running!');
});


/**
 * Endpoint for fetching, searching, and filtering emails 
 */
app.get('/emails', async (req: Request, res: Response) => {
    try {
        
        if (!esClient) {
            return res.status(503).json({ error: "Elasticsearch client not initialized. Synchronization may be starting up." });
        }


        const { q, account, folder, category, page = '1', limit = '10' } = req.query;


        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 10;
        const from = (pageNum - 1) * limitNum;


        const must: any[] = [];
        

        if (q && typeof q === 'string' && q.trim()) {
            must.push({
                multi_match: {
                    query: q.trim(),
                    fields: ['subject', 'body'],
                    fuzziness: 'AUTO' 
                }
            });
        }


        if (account && typeof account === 'string') {
            must.push({ term: { account: account } });
        }
        if (folder && typeof folder === 'string') {
            must.push({ term: { folder: folder } });
        }
        if (category && typeof category === 'string') {
            must.push({ term: { category: category } });
        }
        

        const queryBody = must.length > 0 ? { bool: { must: must } } : { match_all: {} };


        const result: any = await esClient.search({
            index: 'emails',
            from: from,  
            size: limitNum,  
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
            limit: limitNum,  
            emails: emails
        });

    } catch (error) {
        console.error("Error fetching emails from Elasticsearch:", error);
        res.status(500).json({ error: "Failed to retrieve emails from the database." });
    }
});

/**
 * Endpoint for generating AI Suggested Replies 
 */
app.post('/api/emails/:id/suggest-reply', async (req: Request, res: Response) => {
    const emailId = req.params.id; 

    try {
       
        if (!esClient) {
            return res.status(503).json({ error: "Elasticsearch client not initialized." });
        }

       
        const result: any = await esClient.get({ 
            index: 'emails',
            id: emailId
        });

        const emailBody = result._source?.body as string | undefined;

        if (!emailBody) {
            return res.status(404).json({ error: "Email not found or body is missing." });
        }

        
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
    

    try {
      
        await initializeVectorStore();
        console.log("Vector store initialization complete.");

    
        await startEmailSynchronization();

       
        console.log(" Initial 30-day sync complete for all accounts. Shutting down Node.js process automatically.");
        

        process.exit(0); 

    } catch (error) {
        console.error(" Fatal error during initial setup or synchronization. Shutting down server:", error);
        

        process.exit(1); 
    }
  
});
