const { TeamsActivityHandler, MessageFactory } = require('botbuilder');
const { BotFrameworkAdapter } = require('botbuilder');
const restify = require('restify');
const axios = require('axios');

// Konfiguration
const botConfig = {
    appId: process.env.MicrosoftAppId || '',
    appPassword: process.env.MicrosoftAppPassword || ''
};

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const PORT = process.env.PORT || 3978;

// Einfaches Logging
const log = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};

// Bot Framework Adapter
const adapter = new BotFrameworkAdapter(botConfig);

// Fehlerbehandlung
adapter.onTurnError = async (context, error) => {
    log(`Fehler: ${error.message}`);
    
    try {
        await context.sendActivity('Entschuldigung, etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.');
    } catch (sendError) {
        log(`Fehler beim Senden der Fehlermeldung: ${sendError.message}`);
    }
};

// Teams Bot Klasse
class TeamsClaudeBot extends TeamsActivityHandler {
    constructor() {
        super();

        // Nachrichtenbehandlung
        this.onMessage(async (context, next) => {
            const userMessage = context.activity.text?.trim();
            
            if (!userMessage) {
                await context.sendActivity('Bitte senden Sie eine Textnachricht.');
                return await next();
            }

            log(`Nachricht erhalten: ${userMessage}`);
            
            // Typing-Indikator
            try {
                await context.sendActivity({ type: 'typing' });
            } catch (typingError) {
                log(`Typing-Indikator Fehler: ${typingError.message}`);
            }
            
            try {
                const response = await this.getAIResponse(userMessage);
                await context.sendActivity(response);
                log('Antwort gesendet');
                
            } catch (error) {
                log(`AI-Antwort Fehler: ${error.message}`);
                await context.sendActivity('Entschuldigung, ich konnte keine Antwort generieren. Bitte versuchen Sie es später erneut.');
            }
            
            await next();
        });

        // Willkommensnachricht
        this.onMembersAdded(async (context, next) => {
            const welcomeText = `🤖 Hallo! Ich bin Ihr Claude-Bot.\n\nSchreiben Sie mir einfach eine Nachricht und ich antworte Ihnen mit KI-Power!\n\n💡 Tipp: Stellen Sie mir Fragen, bitten Sie um Hilfe oder führen Sie einfach ein Gespräch.`;
            
            for (const member of context.activity.membersAdded) {
                if (member.id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(welcomeText));
                }
            }
            
            await next();
        });
    }

    // AI-Antwort generieren (mit Fallback-Optionen)
    async getAIResponse(message) {
        // Zuerst Claude versuchen
        if (CLAUDE_API_KEY) {
            try {
                return await this.callClaudeAPI(message);
            } catch (error) {
                log(`Claude API Fehler: ${error.message}`);
            }
        }

        // Fallback: Einfache Antworten
        return this.getSimpleResponse(message);
    }

    // Claude API Aufruf
    async callClaudeAPI(message) {
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
        };

        const data = {
            model: 'claude-3-sonnet-20240229', // Günstigeres Modell
            max_tokens: 500, // Reduziert für Kostenersparnis
            messages: [
                {
                    role: 'user',
                    content: message
                }
            ]
        };

        const response = await axios.post('https://api.anthropic.com/v1/messages', data, { 
            headers,
            timeout: 30000 // 30 Sekunden Timeout
        });
        
        return response.data.content[0].text;
    }

    // Einfache Fallback-Antworten
    getSimpleResponse(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('hallo') || lowerMessage.includes('hi')) {
            return 'Hallo! Wie kann ich Ihnen helfen?';
        }
        
        if (lowerMessage.includes('wie geht') || lowerMessage.includes('wie läuft')) {
            return 'Mir geht es gut, danke! Ich bin bereit, Ihnen zu helfen.';
        }
        
        if (lowerMessage.includes('hilfe') || lowerMessage.includes('help')) {
            return 'Ich kann Ihnen bei verschiedenen Aufgaben helfen:\n• Fragen beantworten\n• Texte schreiben\n• Probleme lösen\n• Und vieles mehr!';
        }
        
        if (lowerMessage.includes('wer bist du') || lowerMessage.includes('was bist du')) {
            return 'Ich bin ein KI-Bot, der Ihnen bei verschiedenen Aufgaben helfen kann. Stellen Sie mir einfach eine Frage!';
        }
        
        return `Ich habe Ihre Nachricht erhalten: "${message}"\n\nLeider ist die KI-API momentan nicht verfügbar. Bitte versuchen Sie es später erneut oder kontaktieren Sie den Administrator.`;
    }
}

// Bot-Instanz
const bot = new TeamsClaudeBot();

// Restify Server
const server = restify.createServer({
    name: 'Teams Claude Bot',
    version: '1.0.0'
});

server.use(restify.plugins.bodyParser());

// Health Check Endpoint (für Render.com)
server.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root Endpoint
server.get('/', (req, res) => {
    res.json({ 
        message: 'Teams Claude Bot ist online!',
        timestamp: new Date().toISOString(),
        endpoints: {
            messages: '/api/messages',
            health: '/health'
        }
    });
});

// Bot Messages Endpoint
server.post('/api/messages', async (req, res) => {
    try {
        await adapter.process(req, res, async (context) => {
            await bot.run(context);
        });
    } catch (error) {
        log(`Message processing error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Server starten
server.listen(PORT, () => {
    log(`🚀 Server läuft auf Port ${PORT}`);
    log(`🔗 Bot Endpoint: http://localhost:${PORT}/api/messages`);
    log(`💚 Health Check: http://localhost:${PORT}/health`);
    log(`🤖 Bot ist bereit!`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    log('SIGTERM empfangen, Server wird beendet...');
    server.close(() => {
        log('Server beendet');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('SIGINT empfangen, Server wird beendet...');
    server.close(() => {
        log('Server beendet');
        process.exit(0);
    });
});

// Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Uncaught Exceptions
process.on('uncaughtException', (error) => {
    log(`Uncaught Exception: ${error.message}`);
    process.exit(1);
});