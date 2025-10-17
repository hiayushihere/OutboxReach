// src/services/AISuggestionService.ts

import { retrieveContext } from './VectorStoreService.ts';
    
const LOCAL_MODEL_ENDPOINT = 'http://localhost:11434/api/generate';
const LOCAL_MODEL_NAME = 'phi3';


export async function suggestReply(receivedEmailBody: string): Promise<string> {
    try {
        const context = await retrieveContext(receivedEmailBody);

        const systemInstruction = `You are an AI assistant tasked with writing a reply ON BEHALF OF THE USER (a job seeker or sales professional). 
        The reply MUST be written in the FIRST-PERSON perspective ("I"). 
        The reply MUST be CONCISE (3-5 sentences max), friendly, and professional.
        
        CRITICAL RULES:
        - Analyze the RECEIVED EMAIL: Tailor the reply to its content and intent.
        - Use the 'CONTEXT' (user's agenda) ONLY if it semantically matches the email (e.g., if discussing job applications, interviews, or scheduling). If similarity is low (e.g., spam, promo, unrelated), ignore CONTEXT and generate a general polite response (e.g., thanks but no interest).
        - If CONTEXT is relevant and includes a link, you MUST include it naturally.
        - Do NOT force job-specific language if the email is not about jobs (e.g., no "technical interview" for a promo email).
        - Examples:
          - Job interest email: Use CONTEXT to suggest booking.
          - Promo spam: "Thanks, but this isn't relevant to me right now."
        - Do NOT include a salutation (e.g., "Hi [Name]") or closing signature (e.g., "Best," "[Name]"). Only the body text.
        
        Output ONLY the reply body.`;
        
                const fullPrompt = `System Instruction: ${systemInstruction}
        
        ---
        CONTEXT (User's Agenda - Use only if relevant):
        ${context}
        ---
        
        Received Email:
        ${receivedEmailBody.substring(0, 1000)}...
        
        Suggested Reply (first person, concise, adaptive):`;
        const response = await fetch(LOCAL_MODEL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LOCAL_MODEL_NAME,
                prompt: fullPrompt,
                stream: false,
                options: {
                    temperature: 0.5, 
                }
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        return data.response ? data.response.trim() : 'Could not generate a suggested reply.';

    } catch (error) {
        console.error("AI Reply Suggestion Failed:", error);
        return 'Error: Failed to generate a reply suggestion.';
    }
}
