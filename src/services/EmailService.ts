import { Client as ElasticClient } from '@elastic/elasticsearch';
import { simpleParser } from 'mailparser'; 
import type { ParsedMail } from 'mailparser';
import { categorizeEmail } from './AICategorizationService.ts';
import Imap from 'node-imap';
import { sendSlackNotification, triggerGenericWebhook } from './NotificationService.ts';

const ES_INDEX = 'emails';
const SYNC_WINDOW_DAYS = 30;
const POLLING_INTERVAL_MS = 300000; 
const LLM_THROTTLE_DELAY = 100; 
const MAX_RETRIES = 3; 

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let esClient: ElasticClient | null = null;
const accountTimeouts: { [key: number]: NodeJS.Timeout | null } = {};
const emailsToProcess: { [accountId: number]: any[] } = { 1: [], 2: [] }; 

type ImapConnection = Imap & {
    idle: (callback?: () => void) => void;
    endIdle: () => void;
    _state: string;
};


function decodeHeader(encodedString: string): string {
    if (!encodedString.includes('=?')) {
        return encodedString;
    }

    return encodedString.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, charset, encoding, text) => {
        try {
            encoding = encoding.toUpperCase();

            if (encoding === 'B') {
                const buffer = Buffer.from(text, 'base64');
                return buffer.toString(charset);
            } else if (encoding === 'Q') {
                let decoded = text.replace(/=([0-9A-Fa-f]{2})/g, (match: string, hex: string) => 
                    String.fromCharCode(parseInt(hex, 16))
                );
                return decoded.replace(/_/g, ' '); 
            }
        } catch (e) {
            console.warn(`Failed to decode header using ${encoding} and ${charset}:`, encodedString);
            return text; 
        }
        return text; 
    });
}


async function ensureElasticsearchClient() {
    if (esClient === null) {
        if (!process.env.ELASTIC_HOST) {
            throw new Error("ELASTIC_HOST is missing. Check .env file loading.");
        }
        esClient = new ElasticClient({ node: process.env.ELASTIC_HOST });
        console.log("Elasticsearch client initialized successfully.");
    }

    const exists = await esClient.indices.exists({ index: ES_INDEX });
    if (!exists) {
        await esClient.indices.create({
            index: ES_INDEX,
            mappings: {
                properties: {
                    date: { type: 'date' },
                    from: { type: 'keyword' },
                    to: { type: 'keyword' },
                    subject: { type: 'text' },
                    folder: { type: 'keyword' },
                    account: { type: 'keyword' },
                    uid: { type: 'integer' },
                    category: { type: 'keyword' }
                }
            }
        });
        console.log(`Elasticsearch index '${ES_INDEX}' created with correct mapping.`);
    }
}


function startPolling(imap: ImapConnection, accountId: number) {
    const pollFunc = () => {
        if (accountTimeouts[accountId]) {
            clearTimeout(accountTimeouts[accountId]!);
            accountTimeouts[accountId] = null;
        }

        imap.search(['UNSEEN'], (err: Error | null, uids: any[]) => {
            if (err) {
                console.error(`[Account ${accountId}] Polling search error:`, err);
                return;
            }

            if (uids && uids.length > 0) {
                console.log(`[Account ${accountId}] Polling found ${uids.length} new UNSEEN emails. Fetching and enqueueing...`);
                fetchAndIndexEmails(imap, accountId, uids, true); 
            } else {
                console.log(`[Account ${accountId}] Polling found no new UNSEEN emails.`);
            }

            accountTimeouts[accountId] = setTimeout(pollFunc, POLLING_INTERVAL_MS);
        });
    };

    console.log(`[Account ${accountId}] WARNING: imap.idle unavailable. Starting polling every ${POLLING_INTERVAL_MS / 1000}s.`);
    pollFunc();
}


function startRealtimeMonitoring(imap: ImapConnection, accountId: number) {
    if (typeof imap.idle === 'function') {
        console.log(`[Account ${accountId}] IDLE is supported! Starting IDLE.`);
        const idleHandler = () => {
            imap.idle(() => {
                console.log(`[Account ${accountId}] IDLE session started.`);
            });
        };
        
        imap.once('idle', idleHandler);

        imap.once('mail', (numNewMail: number) => {
            console.log(`[Account ${accountId}] New mail detected! Count: ${numNewMail}`);
            imap.endIdle(); 
            startPolling(imap, accountId); 
        });

        idleHandler();
    } else {
        startPolling(imap, accountId);
    }
}


async function indexEmail(emailData: any, isPolling: boolean = false, imap?: ImapConnection) {
    let category = 'Uncategorized'; 
    const id = `${emailData.account}-${emailData.uid}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            category = await categorizeEmail(emailData.subject, emailData.body);
            break; 
        } catch (error) {
            const status = (error as any).status;
            
            if (status === 503 && attempt < MAX_RETRIES) {
                const waitTime = Math.pow(2, attempt) * 1000;
                console.warn(`[Attempt ${attempt}/${MAX_RETRIES}] Categorization failed (Status: ${status}). Retrying in ${waitTime / 1000}s...`);
                await delay(waitTime);
            } else {
                console.error(`Categorization failed permanently after ${attempt} attempts (Status: ${status}). Falling back to 'Uncategorized'.`, error);
                category = 'Uncategorized';
                break;
            }
        }
    }

    try {
        await ensureElasticsearchClient();
        
        emailData.category = category;

        await esClient!.index({
            index: ES_INDEX,
            id: id,
            document: emailData,
        });

        console.log(`Indexed email ID: ${id} with category: ${category}`);

        if (category === 'Interested') {
            console.log(`[ALERT] Email ${id} categorized as Interested. Triggering notifications...`);
            sendSlackNotification(emailData);
            triggerGenericWebhook(emailData);
        }
        
        if (isPolling && imap && emailData.uid) {
             imap.addFlags([emailData.uid], '\\Seen', (err: Error | null) => {
                if (err) console.error(`[Account ${emailData.account}] Error marking UID ${emailData.uid} as seen:`, err);
            });
        }

    } catch (error) {
        console.error(`Error during Elasticsearch indexing for ID ${id}:`, error);
    }
}

async function processEmailsSerially(accountId: number, imap: ImapConnection, isPolling: boolean = false): Promise<void> {
    const queue = emailsToProcess[accountId];
    
    console.log(`[Account ${accountId}] Starting serial processing of ${queue.length} emails. Using local LLM throttle.`);
    
    let processedCount = 0;
    for (const emailData of queue) {
        if (emailData.uid && emailData.body) {
            await indexEmail(emailData, isPolling, imap);
            await delay(LLM_THROTTLE_DELAY); 
            processedCount++;
        } else {
            console.warn(`[Account ${accountId}] Skipping email ${emailData.uid} due to missing data after parse.`);
        }
    }
    
    emailsToProcess[accountId] = [];
    
    console.log(`[Account ${accountId}] Serial processing finished. Processed: ${processedCount}`);
    
    if (isPolling) {
        startRealtimeMonitoring(imap, accountId);
    }
}



function fetchAndIndexEmails(imap: ImapConnection, accountId: number, uids: any[], isPolling: boolean = false): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!uids || uids.length === 0) {
            if (!isPolling) { resolve(); }
            return;
        }

        const fetch = imap.fetch(uids, {
            bodies: '', 
            struct: true,
        });
        
        if (emailsToProcess[accountId]) {
            emailsToProcess[accountId] = [];
        }

        fetch.on('message', (msg: Imap.ImapMessage, seqno: number) => {
            let emailData: any = { account: accountId, uid: null, folder: 'INBOX', category: 'Uncategorized' };
            const rawMessageStream: Buffer[] = [];
            
            let attributesReceived = false;
            let bodyEndReceived = false;

            const checkAndEnqueue = async () => {
                if (attributesReceived && bodyEndReceived) {
                    if (emailData.uid && emailData.body) {
                        emailsToProcess[accountId].push(emailData);
                    } else {
                        console.error(`[Account ${accountId}] Skipping enqueue for email ${emailData.uid || 'unknown'} due to missing data.`);
                    }
                }
            };

            msg.on('body', (stream: any) => {
                stream.on('data', (chunk: Buffer) => {
                    rawMessageStream.push(chunk);
                });
                
                stream.once('end', async () => {
                    const rawEmailBuffer = Buffer.concat(rawMessageStream);
                    
                    try {
                        const parsed: ParsedMail = await simpleParser(rawEmailBuffer);

                        // FIX: decodeHeader is now correctly defined above
                        emailData.subject = decodeHeader(parsed.subject || 'No Subject');
                        emailData.from = decodeHeader(parsed.from?.text || 'Unknown');
                        emailData.date = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
                        
                        emailData.body = (parsed.text || parsed.html || '').toString().trim();
                        if (emailData.body.length > 5000) {
                            emailData.body = emailData.body.substring(0, 5000) + '... (truncated)';
                        }
                        
                        bodyEndReceived = true;
                        await checkAndEnqueue();

                    } catch (e) {
                        console.error(`[Account ${accountId}] Mailparser error for seqno ${seqno}:`, e);
                        emailData.body = null; 
                        bodyEndReceived = true;
                        await checkAndEnqueue();
                    }
                });
            });
            
            msg.once('attributes', (attrs: Imap.ImapMessageAttributes) => {
                emailData.uid = attrs.uid;
                attributesReceived = true;
                checkAndEnqueue();
            });
            
            msg.once('end', () => {
                
            });
        });

        fetch.once('end', async () => {
            const source = isPolling ? 'Polling fetch' : 'Initial sync';
            console.log(`${source} finished for account ${accountId}. Fetched ${emailsToProcess[accountId].length} emails.`);
            
            try {
                await processEmailsSerially(accountId, imap, isPolling);
                resolve(); 

            } catch (e) {
                reject(e);
            }
        });

        fetch.once('error', (err: Error) => {
            console.error(`[Account ${accountId}] Fetch error:`, err);
            reject(err);
        });
    });
}




function connectAndSync(accountConfig: Imap.Config, accountId: number): Promise<void> {
    return new Promise((resolve, reject) => { 
        const imap: ImapConnection = new Imap(accountConfig as Imap.Config) as unknown as ImapConnection;

        imap.once('ready', () => {
            console.log(`Account ${accountId} ready. Opening INBOX...`);

            imap.openBox('INBOX', false, (err: Error | null, box: Imap.Box) => {
                if (err) return reject(new Error(`[Account ${accountId}] OpenBox error: ${err}`));

                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - SYNC_WINDOW_DAYS);
                const fetchCriteria = [['SINCE', thirtyDaysAgo.toDateString()]];

                imap.search(fetchCriteria, async (err: Error | null, uids: any[]) => {
                    if (err) return reject(new Error(`[Account ${accountId}] Search error: ${err}`));

                    if (!uids || uids.length === 0) {
                        console.log(`No historical emails found for account ${accountId}.`);
                        // FIX: startRealtimeMonitoring is now defined above
                        startRealtimeMonitoring(imap, accountId); 
                        return resolve(); 
                    }

                    console.log(`Found ${uids.length} emails to sync for account ${accountId}.`);

                    try {
                        await fetchAndIndexEmails(imap, accountId, uids, false);
                        resolve(); 
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        });

        imap.once('error', (err: Error) => {
            console.error(`IMAP Error for account ${accountId}:`, err);
            reject(err);
        });

        imap.once('end', () => {
            if (accountTimeouts[accountId]) {
                clearTimeout(accountTimeouts[accountId]!);
                accountTimeouts[accountId] = null;
            }
            console.log(`Connection ended for account ${accountId}. Attempting reconnect in 5s...`);
            setTimeout(() => connectAndSync(accountConfig, accountId), 5000);
        });

        imap.connect();
    });
}


export function startEmailSynchronization(): Promise<void> { 
    console.log(`Starting email synchronization for 2 accounts. Syncing last ${SYNC_WINDOW_DAYS} days...`);
    
    const config1: Imap.Config = {
        user: process.env.EMAIL_1_USER!,
        password: process.env.EMAIL_1_PASSWORD!,
        host: process.env.EMAIL_1_HOST!,
        port: parseInt(process.env.EMAIL_1_PORT!),
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        keepalive: false 
    };

    const config2: Imap.Config = {
        user: process.env.EMAIL_2_USER!,
        password: process.env.EMAIL_2_PASSWORD!,
        host: process.env.EMAIL_2_HOST!,
        port: parseInt(process.env.EMAIL_2_PORT!),
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        keepalive: false 
    };

    const syncPromise1 = connectAndSync(config1, 1);
    const syncPromise2 = connectAndSync(config2, 2);

    return Promise.all([syncPromise1, syncPromise2]).then(() => {
        
    });
}
export { esClient };