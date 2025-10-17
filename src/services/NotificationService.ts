// src/services/NotificationService.ts

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const GENERIC_WEBHOOK_URL = process.env.GENERIC_WEBHOOK_URL;


export async function sendSlackNotification(emailData: any): Promise<void> {
    
    if (!SLACK_WEBHOOK_URL) {
        console.warn("SLACK_WEBHOOK_URL not set. Skipping Slack notification.");
        return;
    }

    const payload = {
        text: ` New *Interested* Lead! \n` +
              `*From:* ${emailData.from}\n` +
              `*Subject:* ${emailData.subject}\n` +
              `*Account:* Account ${emailData.account}`,
        blocks: [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: ` New *Interested* Lead! \n*From:* ${emailData.from}\n*Subject:* ${emailData.subject}`,
                },
            },
            {
                type: "divider",
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `*Account:* Account ${emailData.account} | *UID:* ${emailData.uid}`
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            console.log(`[Notification] Slack alert sent successfully for ID: ${emailData.account}-${emailData.uid}`);
        } else {
            console.error(`[Notification] Failed to send Slack alert (Status: ${response.status})`);
        }
    } catch (error) {
        console.error("[Notification] Error sending Slack alert:", error);
    }
}


export async function triggerGenericWebhook(emailData: any): Promise<void> {
    const GENERIC_WEBHOOK_URL = process.env.GENERIC_WEBHOOK_URL;
    if (!GENERIC_WEBHOOK_URL) {
        console.warn("GENERIC_WEBHOOK_URL not set. Skipping generic webhook trigger.");
        return;
    }


    const bodySnippet = emailData.body
        ? emailData.body.toString().substring(0, 150).replace(/\s+/g, ' ').trim() + '...'
        : 'No body available...';
    
    const payload = {
        category: emailData.category,
        account: `Account ${emailData.account}`,
        subject: emailData.subject,
        from: emailData.from,
        date: emailData.date,
        body_snippet: bodySnippet, 
        email_id: `${emailData.account}-${emailData.uid}`
    };

    try {
        const response = await fetch(GENERIC_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (response.ok) {
            console.log(`[Webhook] Generic webhook triggered successfully for ID: ${emailData.account}-${emailData.uid}`);
        } else {
            const errorText = await response.text();
            console.error(`[Webhook] Failed to trigger generic webhook (Status: ${response.status}). Response: ${errorText.substring(0, 100)}...`);
        }
    } catch (error) {
        console.error("[Webhook] Error triggering generic webhook:", error);
    }
}