const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Claude API Konfiguration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

// Claude API Aufruf
async function callClaudeAPI(message) {
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
    };

    const data = {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 500,
        messages: [
            {
                role: 'user',
                content: message
            }
        ]
    };

    try {
        const response = await axios.post('https://api.anthropic.com/v1/messages', data, { headers });
        return response.data.content[0].text;
    } catch (error) {
        console.error('Claude API Fehler:', error.response?.data || error.message);
        return 'Entschuldigung, ich konnte keine Antwort generieren.';
    }
}

// Teams Nachricht senden
async function sendToTeams(message) {
    if (!TEAMS_WEBHOOK_URL) {
        console.error('Teams Webhook URL nicht konfiguriert');
        return;
    }

    const payload = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "summary": "Claude Bot Antwort",
        "themeColor": "0078D4",
        "sections": [{
            "activityTitle": "🤖 Claude Bot",
            "activitySubtitle": "AI Assistent",
            "activityImage": "https://cdn-icons-png.flaticon.com/512/4712/4712027.png",
            "text": message,
            "markdown": true
        }]
    };

    try {
        await axios.post(TEAMS_WEBHOOK_URL, payload);
        console.log('Nachricht an Teams gesendet');
    } catch (error) {
        console.error('Teams Webhook Fehler:', error.response?.data || error.message);
    }
}

// Hauptroute - Web Interface
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Claude Teams Bot</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { 
                color: #464775;
                text-align: center;
                margin-bottom: 30px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: #333;
            }
            textarea {
                width: 100%;
                min-height: 100px;
                padding: 10px;
                border: 2px solid #ddd;
                border-radius: 5px;
                font-size: 16px;
                resize: vertical;
            }
            button {
                background: #0078d4;
                color: white;
                padding: 12px 30px;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                width: 100%;
                margin-top: 10px;
            }
            button:hover {
                background: #106ebe;
            }
            button:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .response {
                margin-top: 20px;
                padding: 15px;
                border-radius: 5px;
                display: none;
            }
            .response.success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            .response.error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            .loading {
                text-align: center;
                color: #666;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 Claude Teams Bot</h1>
            <form id="messageForm">
                <div class="form-group">
                    <label for="message">Nachricht an Claude:</label>
                    <textarea id="message" name="message" placeholder="Stellen Sie Claude eine Frage oder bitten Sie um Hilfe..." required></textarea>
                </div>
                <button type="submit" id="submitBtn">📤 An Teams senden</button>
            </form>
            
            <div id="response" class="response"></div>
        </div>

        <script>
            document.getElementById('messageForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const message = document.getElementById('message').value;
                const submitBtn = document.getElementById('submitBtn');
                const response = document.getElementById('response');
                
                // UI Updates
                submitBtn.disabled = true;
                submitBtn.textContent = '⏳ Verarbeitung...';
                response.style.display = 'none';
                
                try {
                    const res = await fetch('/send', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ message })
                    });
                    
                    const data = await res.json();
                    
                    if (res.ok) {
                        response.className = 'response success';
                        response.textContent = '✅ Nachricht erfolgreich an Teams gesendet!';
                        document.getElementById('message').value = '';
                    } else {
                        response.className = 'response error';
                        response.textContent = '❌ Fehler: ' + data.error;
                    }
                } catch (error) {
                    response.className = 'response error';
                    response.textContent = '❌ Verbindungsfehler: ' + error.message;
                }
                
                response.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = '📤 An Teams senden';
            });
        </script>
    </body>
    </html>
    `);
});

// API Endpoint für Nachrichten
app.post('/send', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Nachricht ist erforderlich' });
        }
        
        console.log('Nachricht erhalten:', message);
        
        // Claude API aufrufen
        const claudeResponse = await callClaudeAPI(message);
        
        // Formatierte Antwort für Teams
        const teamsMessage = `**Frage:** ${message}\n\n**Claude:** ${claudeResponse}`;
        
        // An Teams senden
        await sendToTeams(teamsMessage);
        
        res.json({ 
            success: true, 
            message: 'Nachricht erfolgreich an Teams gesendet',
            response: claudeResponse 
        });
        
    } catch (error) {
        console.error('Fehler:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        config: {
            claudeConfigured: !!CLAUDE_API_KEY,
            teamsConfigured: !!TEAMS_WEBHOOK_URL
        }
    });
});

app.listen(port, () => {
    console.log(`🚀 Server läuft auf Port ${port}`);
    console.log(`🌐 Web Interface: http://localhost:${port}`);
    console.log(`🔧 Health Check: http://localhost:${port}/health`);
    console.log(`📝 Claude API: ${CLAUDE_API_KEY ? '✅ Konfiguriert' : '❌ Fehlt'}`);
    console.log(`📱 Teams Webhook: ${TEAMS_WEBHOOK_URL ? '✅ Konfiguriert' : '❌ Fehlt'}`);
});