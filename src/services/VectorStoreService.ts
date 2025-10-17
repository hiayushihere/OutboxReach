// src/services/VectorStoreService.ts

import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory'; 
import { Document } from '@langchain/core/documents';

const EMBEDDING_MODEL = 'nomic-embed-text'; 

let vectorStore: MemoryVectorStore | null = null;
let isInitialized = false;


export async function initializeVectorStore(): Promise<void> {
    if (isInitialized) {
        console.log("Vector store already initialized.");
        return;
    }

    console.log("Initializing Vector Store with agenda...");

    const agenda = [
        "Express enthusiasm for the opportunity discussed. Propose next steps like a quick call or demo to explore further.",
        "To move forward, suggest scheduling via my availability link: https://cal.com/example. I'm flexible during business hours.",
        "Highlight key value from our discussion and offer to answer any questions in a dedicated session."
    ];
    const documents = agenda.map((content, i) => new Document({
        pageContent: content,
        metadata: { id: i, source: 'outreach_agenda' }
    }));

    try {
        const embeddings = new OllamaEmbeddings({ 
            model: EMBEDDING_MODEL, 
            baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434' 
        });

        vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
        isInitialized = true;
        console.log("Vector Store initialized and agenda indexed successfully.");

    } catch (error) {
        console.error("Vector Store Initialization Failed (Is Ollama running and nomic-embed-text pulled?):", error);
        throw error;
    }
}

/**
 * @param emailContent 
 * @returns 
 */
export async function retrieveContext(emailContent: string): Promise<string> {
    if (!vectorStore) {
        throw new Error("Vector store not initialized.");
    }

    const results = await vectorStore.similaritySearch(emailContent, 2); // Get top 2 results

    const context = results.map(doc => doc.pageContent).join('\n---\n');

    return context;
}
