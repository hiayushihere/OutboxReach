// src/services/AICategorizationService.ts

export type EmailCategory = 'Interested' | 'Meeting Booked' | 'Not Interested' | 'Out of Office' | 'Spam' | 'Uncategorized';
const LOCAL_MODEL_ENDPOINT = 'http://localhost:11434/api/generate'; 

const LOCAL_MODEL_NAME = 'phi3'; 

const CATEGORIES: EmailCategory[] = [
    'Interested',
    'Meeting Booked',
    'Not Interested',
    'Out of Office',
    'Spam',
    'Uncategorized', 
];

const SYSTEM_INSTRUCTION = `You are a highly **selective** B2B sales email categorization expert. Your primary role is to filter out ALL noise (Spam) and identify ONLY personalized, actionable replies to sales outreach (Interested/Not Interested).

You MUST return your classification as a single JSON object. Do NOT add explanations or extra text.

Available Labels: ${CATEGORIES.join(', ')}.

---
STRICT CLASSIFICATION RULES (ENFORCE HIERARCHY - NO EXCEPTIONS):

1. 'Meeting Booked' / 'Out of Office': 
    * ONLY for explicit scheduling confirmations (e.g., "Call set for Friday") or true OOO auto-replies (e.g., "Out until next week"). 
    * Ignore vacation replies that are not auto-replies.

2. **CRITICAL HIGH PRIORITY - ACTIONABLE REPLIES ONLY:** 'Interested' / 'Not Interested':
    * **STRICTLY LIMITED TO:** Personalized replies from a prospect directly responding to YOUR sales outreach.
    * **Interested:** Clear positive intent SPECIFIC to your product/service (e.g., "Tell me more about your CRM tool", "When can we demo?"). Must reference your outreach or ask targeted questions.
    * **Not Interested:** Explicit rejection of YOUR outreach (e.g., "Not a fit for us", "Please remove from list").
    * **DO NOT USE** if the email is generic, promotional, or unrelated to your sales context.

3. **MANDATORY NOISE REMOVAL:** 'Spam':
    * Classify as SPAM for **ANY** unsolicited, generic, promotional, mass-marketing, newsletter, or irrelevant email that does NOT require a personal sales follow-up.
    * Examples: Brand promotions (e.g., Zivame offers, Flipkart sales), newsletters, event invites, surveys, auto-confirmations (not OOO), bank alerts, or ANY bulk/impersonal content.
    * **RUTHLESSLY APPLY:** If it's not a direct reply to your outreach, it's Spam. Err on the side of Spam for anything promotional or off-topic.

4. 'Uncategorized': **ABSOLUTELY ONLY** if the email body is completely blank, corrupted, or unreadable. Never use as a default.

---
EXAMPLES (FOLLOW THESE EXACTLY):

{"category": "Out of Office"} -> Email: "I am out of office until October 25th. Emails will be read upon return."
{"category": "Meeting Booked"} -> Email: "Confirmed our demo call for Thursday at 2 PM."
{"category": "Interested"} -> Email: "Your email about the AI tool caught my eye. What's the pricing for enterprise?"
{"category": "Not Interested"} -> Email: "Thanks, but we're not looking to switch CRM providers right now."
{"category": "Spam"} -> Email: "Exclusive 50% off on Zivame lingerie! Shop now."
{"category": "Spam"} -> Email: "Weekly newsletter: Top tech trends from Gartner."
{"category": "Spam"} -> Email: "Your subscription confirmation for Amazon Prime."
{"category": "Uncategorized"} -> Email: "" (blank body)

ALWAYS classify based on content alone. Promotional or irrelevant = Spam.`;

export async function categorizeEmail(subject: string, body: string): Promise<EmailCategory> {
    const fullContent = `Subject: ${subject}\n\nBody: ${body.substring(0, 1000)}...`; 
    
    const prompt = `System Instruction: ${SYSTEM_INSTRUCTION}\n\nEmail Content:\n${fullContent}\n\nJSON Output:`;

    try {
        const response = await fetch(LOCAL_MODEL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LOCAL_MODEL_NAME, 
                prompt: prompt,
                format: 'json', 
                stream: false,
                options: {
                    temperature: 0.1,
                }
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        const rawJsonString = data.response ? data.response.trim() : ''; 
        
        // Robust JSON parsing
        const startIndex = rawJsonString.indexOf('{');
        const endIndex = rawJsonString.lastIndexOf('}') + 1;
        const jsonString = rawJsonString.substring(startIndex, endIndex);

        const jsonResponse = JSON.parse(jsonString);
        
        const finalCategory = jsonResponse.category;
        
        // Ensure the returned category is one of the valid ones
        if (CATEGORIES.includes(finalCategory as EmailCategory)) {
            return finalCategory as EmailCategory;
        }

        console.warn(`Local model returned invalid category: ${finalCategory}`);
        return 'Uncategorized';

    } catch (error) {
        console.error("Local model categorization failed (Is Ollama running and is 'phi3' pulled?):", error);
        throw error;
    }
}
