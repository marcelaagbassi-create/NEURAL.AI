```react
import React, { useState, useEffect, useRef } from 'react';

// Configuration de l'API Gemini
const apiKey = ""; // La clé est injectée automatiquement à l'exécution par l'environnement de prévisualisation.

// Helper pour l'attente (backoff exponentiel)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Appel d'API générique avec gestion du backoff exponentiel (retente jusqu'à 5 fois)
async function callGeminiAPI(url, payload, retries = 5) {
  let currentDelay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        return await response.json();
      }
      if (response.status === 429 || response.status >= 500) {
        await delay(currentDelay);
        currentDelay *= 2;
        continue;
      }
      const errText = await response.text();
      throw new Error(`Erreur API (${response.status}): ${errText}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(currentDelay);
      currentDelay *= 2;
    }
  }
  throw new Error("L'API n'a pas répondu après plusieurs tentatives.");
}

// Fonction de conversion PCM 16 bits brut en fichier WAV
function pcmToWav(pcmBase64, sampleRate = 24000) {
  const binaryString = window.atob(pcmBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const buffer = bytes.buffer;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + buffer.byteLength, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, buffer.byteLength, true);

  const blob = new Blob([wavHeader, buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

// Analyseur de message pour détecter et extraire les blocs de code afin de générer l'aperçu en direct
function parseMessageContent(text) {
  const segments = [];
  const regex = /```(html|css|javascript|js|json|python)?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex, match.index)
      });
    }
    segments.push({
      type: 'code',
      language: match[1] || 'html',
      code: match[2].trim()
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

// Composant utilitaire centralisant toutes les icônes SVG inspirées de Google Material et Gemini
function Icon({ name, className = "w-5 h-5", strokeWidth = 1.5 }) {
  const icons = {
    logo: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2c-.3 0-.5.2-.6.4l-2.4 5.1-5.1 2.4c-.2.1-.4.3-.4.6 0 .3.2.5.4.6l5.1 2.4 2.4 5.1c.1.2.3.4.6.4s.5-.2.6-.4l2.4-5.1 5.1-2.4c.2-.1.4-.3.4-.6 0-.3-.2-.5-.4-.6l-5.1-2.4-2.4-5.1c-.1-.2-.3-.4-.6-.4zm-5 13c-.2 0-.3.1-.4.2l-1.2 2.5-2.5 1.2c-.1.1-.2.2-.2.3s.1.2.2.3l2.5 1.2 1.2 2.5c.1.1.2.2.3.2s.3-.1.4-.2l1.2-2.5 2.5-1.2c.1-.1.2-.2.2-.3s-.1-.2-.2-.3l-2.5-1.2-1.2-2.5c-.1-.1-.2-.2-.3-.2zm12-11c-.1 0-.2.1-.3.2l-.8 1.7-1.7.8c-.1.1-.2.2-.2.3s.1.2.3.2l1.7.8.8 1.7c.1.1.2.2.3.2s.2-.1.3-.2l.8-1.7 1.7-.8c.1-.1.2-.2.2-.3s-.1-.2-.2-.3l-1.7-.8-.8-1.7c-.1-.1-.2-.2-.3-.2z"/>
      </svg>
    ),
    lumina: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path d="M2 12h20" />
      </svg>
    ),
    coder: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </svg>
    ),
    writer: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    artist: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    vocal: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
    text: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <line x1="21" y1="10" x2="3" y2="10" />
        <line x1="21" y1="6" x2="3" y2="6" />
        <line x1="21" y1="14" x2="3" y2="14" />
        <line x1="21" y1="18" x2="3" y2="18" />
      </svg>
    ),
    sparkle: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      </svg>
    ),
    image: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    trash: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
    plus: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
    send: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    user: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    close: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    menu: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),
    play: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
    pause: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    ),
    download: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    copy: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
    check: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    alert: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    info: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    split: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="12" y1="3" x2="12" y2="21" />
      </svg>
    ),
    eye: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    code: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    bulb: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .6 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
        <line x1="9" y1="18" x2="15" y2="18" />
        <line x1="10" y1="22" x2="14" y2="22" />
      </svg>
    ),
    compass: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
    mic: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
    stop: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    )
  };

  return icons[name] || null;
}

// Composant de l'éditeur de code interactif avec Aperçu, mode Scindé et Téléchargement
function CodePlayground({ code, language, showToast }) {
  const [activeTab, setActiveTab] = useState('split');
  const iframeRef = useRef(null);

  const handleCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = code;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast("Code copié !", "success");
    } catch (err) {
      showToast("Échec de la copie", "error");
    }
    document.body.removeChild(textArea);
  };

  // NOUVELLE FONCTIONNALITÉ : Téléchargement du fichier de l'application générée
  const handleDownloadCode = () => {
    let extension = 'txt';
    const lang = language?.toLowerCase() || '';
    
    // Déduction de l'extension en fonction du langage ou du contenu
    if (lang === 'html' || code.includes('<!DOCTYPE html>') || code.includes('<html')) {
      extension = 'html';
    } else if (lang === 'javascript' || lang === 'js' || lang === 'jsx' || lang === 'react') {
      extension = 'js';
    } else if (lang === 'python' || lang === 'py') {
      extension = 'py';
    } else if (lang === 'css') {
      extension = 'css';
    } else if (lang === 'json') {
      extension = 'json';
    }

    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `application.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Fichier application.${extension} téléchargé avec succès !`, "success");
  };

  const getIframeSrcDoc = () => {
    if (language?.toLowerCase() === 'html' || code.includes('<!DOCTYPE html>') || code.includes('<html')) {
      return code;
    }
    if (language?.toLowerCase() === 'javascript' || language?.toLowerCase() === 'js') {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: system-ui, sans-serif; 
              background-color: #131314; 
              color: #e3e3e3; 
              padding: 20px;
            }
            pre { background: #1e1f20; padding: 15px; border-radius: 8px; border: 1px solid #2e2f30; overflow: auto;}
          </style>
        </head>
        <body>
          <h3 style="color: #a8c7fa; margin-top: 0;">Console d'exécution JS</h3>
          <div id="output">Exécution en cours...</div>
          <script>
            const output = document.getElementById('output');
            const originalLog = console.log;
            console.log = function(...args) {
              output.innerHTML = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
              originalLog.apply(console, args);
            };
            try {
              ${code}
            } catch(e) {
              output.innerHTML = '<span style="color: #ff8f8f;">Erreur : ' + e.message + '</span>';
            }
          </script>
        </body>
        </html>
      `;
    }
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: sans-serif; background-color: #131314; color: #e3e3e3; padding: 20px; }
        </style>
      </head>
      <body>
        <pre>${code}</pre>
      </body>
      </html>
    `;
  };

  return (
    <div className="w-full my-5 rounded-2xl border border-[#2e2f30] bg-[#1e1f20] overflow-hidden shadow-2xl flex flex-col h-[500px]">
      <div className="flex items-center justify-between px-4 py-3 bg-[#131314] border-b border-[#2e2f30]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold tracking-wider text-indigo-400 uppercase bg-indigo-950/40 px-2 py-1 rounded">
            {language || 'html'}
          </span>
          <span className="text-xs text-[#8e918f] font-medium">Neural Interactive Sandbox</span>
        </div>

        <div className="flex bg-[#1e1f20] rounded-full p-1 border border-[#2e2f30]">
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTab === 'code' ? 'bg-[#282a2c] text-[#e3e3e3]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon name="code" className="w-3.5 h-3.5" />
            Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTab === 'preview' ? 'bg-[#282a2c] text-[#e3e3e3]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon name="eye" className="w-3.5 h-3.5" />
            Aperçu
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('split')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeTab === 'split' ? 'bg-[#282a2c] text-[#e3e3e3]' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon name="split" className="w-3.5 h-3.5" />
            Scindé
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-[#282a2c] text-slate-400 hover:text-white transition-colors"
            title="Copier le code"
          >
            <Icon name="copy" className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDownloadCode}
            className="p-1.5 rounded hover:bg-[#004a77]/50 text-indigo-400 hover:text-indigo-300 transition-colors"
            title="Télécharger le fichier de l'application"
          >
            <Icon name="download" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 bg-[#131314]">
        {(activeTab === 'code' || activeTab === 'split') && (
          <div className="flex-1 overflow-auto p-4 font-mono text-xs text-[#c4c7c5] border-r border-[#2e2f30] bg-[#1e1f20]">
            <pre className="whitespace-pre overflow-x-auto select-text leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        )}

        {(activeTab === 'preview' || activeTab === 'split') && (
          <div className="flex-1 bg-white relative h-full">
            <iframe
              ref={iframeRef}
              title="Sandbox"
              srcDoc={getIframeSrcDoc()}
              sandbox="allow-scripts"
              className="w-full h-full border-none bg-white"
            />
          </div>
        )}
      </div>
    </div>
  );
}

const PERSONAS = [
  {
    id: "general",
    name: "Compagnon Lumina",
    description: "Assistant généraliste, bienveillant et structuré.",
    icon: "lumina",
    prompt: "Tu es Lumina, un assistant IA généraliste brillant, chaleureux et concis. Réponds en français de manière élégante et structurée en utilisant le markdown."
  },
  {
    id: "coder",
    name: "Codex Pro",
    description: "Expert en programmation, logique et applications interactives.",
    icon: "coder",
    prompt: "Tu es Codex Pro, un expert en développement logiciel de classe mondiale. IMPORTANT : Lorsque l'utilisateur te demande de coder un composant, un widget, un jeu ou une application, génère TOUJOURS une version fonctionnelle complète et autonome incluse dans un unique bloc de code ```html contenant l'ensemble du code CSS (balise <style>) et JS (balise <script>). Cela permettra à l'interpréteur interactif de l'application de s'afficher et de s'exécuter instantanément dans l'aperçu dynamique."
  },
  {
    id: "writer",
    name: "Plume Créative",
    description: "Idéal pour brainstormer, rédiger et reformuler.",
    icon: "writer",
    prompt: "Tu es Plume Créative, un auteur et poète talentueux. Aide l'utilisateur à rédiger des histoires de façon imagée et passionnante."
  },
  {
    id: "image_gen",
    name: "Studio Artiste",
    description: "Générateur d'images haute fidélité Imagen 4.",
    icon: "artist",
    prompt: "Tu es l'assistant artistique. Écris une courte description de l'image demandée avant de la générer."
  },
  {
    id: "vocal",
    name: "Orateur Vocal",
    description: "Compagnon audio idéal pour des dialogues fluides.",
    icon: "vocal",
    prompt: "Tu es Orateur Vocal. Fais des réponses courtes, directes et adaptées à une synthèse vocale de 2 phrases maximum."
  }
];

const TTS_VOICES = [
  { id: "Kore", label: "Kore (Chaleureux)" },
  { id: "Zephyr", label: "Zephyr (Dynamique)" },
  { id: "Leda", label: "Leda (Douce)" },
  { id: "Fenrir", label: "Fenrir (Profond)" },
  { id: "Puck", label: "Puck (Espiègle)" }
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [currentPersona, setCurrentPersona] = useState(PERSONAS[0]);
  const [loading, setLoading] = useState(false);
  const [generationType, setGenerationType] = useState("text"); // 'text', 'image' ou 'vocal'
  const [ttsVoice, setTtsVoice] = useState("Kore");
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPlayingAudioId, setIsPlayingAudioId] = useState(null);

  // États pour l'enregistrement vocal
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);

  const messagesEndRef = useRef(null);
  const audioRefs = useRef({});

  // Auto-scroll au bas du chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Toast temporaire
  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Changement de Persona
  const handlePersonaChange = (persona) => {
    setCurrentPersona(persona);
    if (persona.id === "image_gen") {
      setGenerationType("image");
    } else if (persona.id === "vocal") {
      setGenerationType("vocal");
    } else {
      setGenerationType("text");
    }
    showToast(`Assistant actif : ${persona.name}`, "info");
  };

  // Fonctionnalité Gemini: Améliorateur Magique de Prompt
  const handleEnhancePrompt = async () => {
    if (!inputMessage.trim()) return;
    setIsEnhancingPrompt(true);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: "user", parts: [{ text: inputMessage }] }],
        systemInstruction: { parts: [{ text: "Tu es un expert en Prompt Engineering. Ton but est d'améliorer le prompt de l'utilisateur pour le rendre extrêmement clair, détaillé et optimisé pour une IA. Renvoie UNIQUEMENT le prompt amélioré." }] }
      };
      const result = await callGeminiAPI(url, payload);
      const enhanced = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (enhanced) {
        setInputMessage(enhanced.trim());
        showToast("Prompt amélioré avec succès ✨", "success");
      }
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'amélioration du prompt", "error");
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  // Gestion du démarrage de l'enregistrement vocal
  const startRecording = async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        // Conversion en base64 pour envoi à Gemini
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = reader.result.split(',')[1];
          await handleSendVocalMessage(base64Data, audioBlob);
        };
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      setIsRecording(true);
      showToast("Enregistrement en cours...", "info");
    } catch (err) {
      console.error(err);
      showToast("Impossible d'accéder au microphone. Veuillez autoriser l'accès.", "error");
    }
  };

  // Gestion de l'arrêt de l'enregistrement vocal
  const stopRecording = () => {
    if (!isRecording || !mediaRecorder) return;
    mediaRecorder.stop();
    // Arrête tous les flux de média pour libérer le micro
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    setIsRecording(false);
  };

  // Envoi direct du message vocal (Audio Base64) à l'API Gemini
  const handleSendVocalMessage = async (base64Audio, audioBlob) => {
    const userMsgId = `user_${Date.now()}`;
    const audioUrl = URL.createObjectURL(audioBlob);

    // Ajouter le message vocal dans l'interface utilisateur
    setMessages(prev => [...prev, {
      id: userMsgId,
      role: "user",
      text: "🎤 Message vocal envoyé",
      audio: audioUrl,
      timestamp: new Date()
    }]);

    setLoading(true);
    const botMsgId = `bot_${Date.now()}`;

    try {
      // Préparation du payload avec le fichier audio
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "audio/webm",
                  data: base64Audio
                }
              },
              {
                text: "L'utilisateur vient de t'envoyer ce message vocal en français. Réponds-y de manière concise en français. Écris une réponse chaleureuse."
              }
            ]
          }
        ],
        systemInstruction: { parts: [{ text: currentPersona.prompt }] }
      };

      const result = await callGeminiAPI(url, payload);
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Je n'ai pas pu comprendre l'audio.";

      // Puisque c'était une interaction vocale, on génère de vive voix AUTOMATIQUEMENT
      await fetchAndAutoPlayVocalResponse(responseText, botMsgId);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: "assistant",
        text: `Erreur d'analyse audio : ${err.message}`,
        timestamp: new Date(),
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Synthétiser une réponse vocale et la jouer immédiatement
  const fetchAndAutoPlayVocalResponse = async (responseText, botMsgId) => {
    try {
      const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
      const ttsPayload = {
        contents: [{ parts: [{ text: `Say cheerfully: ${responseText}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: ttsVoice }
            }
          }
        },
        model: "gemini-2.5-flash-preview-tts"
      };

      const ttsResult = await callGeminiAPI(ttsUrl, ttsPayload);
      const audioBase64 = ttsResult.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

      if (audioBase64) {
        const audioUrl = pcmToWav(audioBase64, 24000);
        
        // On pousse le message dans l'interface avec l'audio prêt
        setMessages(prev => [...prev, {
          id: botMsgId,
          role: "assistant",
          text: responseText,
          audio: audioUrl,
          timestamp: new Date()
        }]);

        // AUTO-PLAY IMMÉDIAT
        setTimeout(() => {
          toggleAudio(botMsgId, audioUrl);
        }, 300);

        showToast("Message vocalisé automatiquement !", "success");
      } else {
        // Fallback texte si la voix échoue
        setMessages(prev => [...prev, {
          id: botMsgId,
          role: "assistant",
          text: responseText,
          timestamp: new Date()
        }]);
      }
    } catch (err) {
      console.error("Échec de synthèse automatique", err);
      // Fallback
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: "assistant",
        text: responseText,
        timestamp: new Date()
      }]);
    }
  };

  // Fonctionnalité Gemini: Génération intelligente de suggestions de suivi
  const generateFollowUps = async (contextMessages, botResponse, msgId) => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          ...contextMessages,
          { role: "model", parts: [{ text: botResponse }] },
          { role: "user", parts: [{ text: "Génère exactement 3 suggestions de questions courtes (max 8 mots) que je pourrais te poser ensuite pour approfondir. Renvoie un tableau JSON strict de chaînes de caractères." }] }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: { type: "STRING" }
          }
        }
      };
      const result = await callGeminiAPI(url, payload);
      const suggestions = JSON.parse(result.candidates[0].content.parts[0].text);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, suggestions } : m));
    } catch (err) {
      console.error("Failed to generate follow-ups", err);
    }
  };

  // Envoi de message textuel classique
  const handleSendMessage = async (textToSend) => {
    const userText = (typeof textToSend === "string" ? textToSend : inputMessage).trim();
    if (!userText) return;

    setInputMessage("");

    const userMsgId = `user_${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      role: "user",
      text: userText,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const botMsgId = `bot_${Date.now()}`;

    try {
      if (generationType === "image") {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
        const payload = {
          instances: [{ prompt: userText }],
          parameters: { sampleCount: 1 }
        };

        const result = await callGeminiAPI(url, payload);
        const base64Bytes = result?.predictions?.[0]?.bytesBase64Encoded;

        if (base64Bytes) {
          const imageUrl = `data:image/png;base64,${base64Bytes}`;
          setMessages(prev => [...prev, {
            id: botMsgId,
            role: "assistant",
            text: `Voici l'image générée pour : "${userText}"`,
            image: imageUrl,
            timestamp: new Date()
          }]);
          showToast("Image créée avec succès !", "success");
        } else {
          throw new Error("L'API Imagen n'a retourné aucune donnée d'image.");
        }

      } else if (generationType === "vocal") {
        const textUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        const textPayload = {
          contents: [{ parts: [{ text: userText }] }],
          systemInstruction: { parts: [{ text: currentPersona.prompt + " Sois très court, maximum 2 phrases." }] }
        };

        const textResult = await callGeminiAPI(textUrl, textPayload);
        const responseText = textResult.candidates?.[0]?.content?.parts?.[0]?.text || "Désolé, je n'ai pas pu générer de texte.";

        // Vocalisation et lecture automatique
        await fetchAndAutoPlayVocalResponse(responseText, botMsgId);

      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        
        const contextMessages = messages.slice(-6).map(m => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }]
        }));
        contextMessages.push({ role: "user", parts: [{ text: userText }] });

        const payload = {
          contents: contextMessages,
          systemInstruction: { parts: [{ text: currentPersona.prompt }] }
        };

        const result = await callGeminiAPI(url, payload);
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Désolé, je n'ai pas pu générer de réponse.";
        
        const groundings = result.candidates?.[0]?.groundingMetadata?.groundingAttributions?.map(a => ({
          uri: a.web?.uri,
          title: a.web?.title
        })) || [];

        setMessages(prev => [...prev, {
          id: botMsgId,
          role: "assistant",
          text: text,
          sources: groundings,
          timestamp: new Date()
        }]);

        // Lancer la génération des suggestions contextuelles
        generateFollowUps(contextMessages, text, botMsgId);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: botMsgId,
        role: "assistant",
        text: `Erreur : ${err.message}. Veuillez vérifier votre connexion.`,
        timestamp: new Date(),
        isError: true
      }]);
      showToast("Une erreur s'est produite lors de la génération.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Contrôleur de lecture audio
  const toggleAudio = (msgId, url) => {
    if (isPlayingAudioId === msgId) {
      audioRefs.current[msgId].pause();
      setIsPlayingAudioId(null);
    } else {
      if (isPlayingAudioId && audioRefs.current[isPlayingAudioId]) {
        audioRefs.current[isPlayingAudioId].pause();
      }
      
      if (!audioRefs.current[msgId]) {
        audioRefs.current[msgId] = new Audio(url);
        audioRefs.current[msgId].onended = () => setIsPlayingAudioId(null);
      }
      audioRefs.current[msgId].play();
      setIsPlayingAudioId(msgId);
    }
  };

  const clearChat = () => {
    setMessages([]);
    showToast("Nouveau fil de discussion démarré", "info");
  };

  return (
    <div className="flex h-screen w-screen bg-[#131314] text-[#e3e3e3] overflow-hidden font-sans">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300 transform translate-y-0 border text-sm ${
          toast.type === "success" ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300" :
          toast.type === "error" ? "bg-rose-950/90 border-rose-500/50 text-rose-300" :
          "bg-[#1e1f20]/90 border-slate-700 text-slate-300"
        }`}>
          <Icon name={toast.type === "success" ? "check" : toast.type === "error" ? "alert" : "info"} className="w-5 h-5" />
          <p className="font-medium">{toast.message}</p>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-[280px] bg-[#1e1f20] p-4 flex flex-col justify-between z-40 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 border-r border-transparent`}>
        
        <div className="space-y-6 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-2.5 rounded-full hover:bg-[#282a2c] text-[#e3e3e3] transition-colors lg:hidden"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-2 font-mono">NEURAL.AI WORKSPACE</span>
          </div>

          <button 
            onClick={clearChat}
            className="flex items-center gap-3 py-3 px-4 rounded-full bg-[#131314]/50 hover:bg-[#282a2c] text-[#c4c7c5] hover:text-white text-sm font-medium transition-all border border-slate-800"
          >
            <Icon name="plus" className="w-4 h-4" />
            Nouveau chat
          </button>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-none">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block px-2 mb-2">Modèles & Spécialités</span>
            {PERSONAS.map((persona) => {
              const isSelected = currentPersona.id === persona.id;
              return (
                <button
                  key={persona.id}
                  onClick={() => handlePersonaChange(persona)}
                  className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-full transition-all text-left ${
                    isSelected 
                      ? 'bg-[#004a77]/30 text-[#e3e3e3] border-l-2 border-indigo-400 font-medium' 
                      : 'hover:bg-[#282a2c] text-[#c4c7c5]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isSelected ? 'bg-[#004a77]/50 text-indigo-300' : 'bg-[#131314]/60 text-slate-400'
                  }`}>
                    <Icon name={persona.icon} className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs truncate">{persona.name}</h4>
                    <p className="text-[9px] text-slate-500 truncate">{persona.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-850 pt-4 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block px-2">Type de génération</span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#131314] rounded-full">
              <button
                type="button"
                onClick={() => setGenerationType("text")}
                className={`flex flex-col items-center gap-1 py-1.5 px-2 rounded-full text-[10px] font-medium transition-all ${
                  generationType === "text" 
                    ? 'bg-[#1e1f20] text-indigo-400 shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon name="text" className="w-3.5 h-3.5" />
                Texte
              </button>
              <button
                type="button"
                onClick={() => setGenerationType("image")}
                className={`flex flex-col items-center gap-1 py-1.5 px-2 rounded-full text-[10px] font-medium transition-all ${
                  generationType === "image" 
                    ? 'bg-[#1e1f20] text-purple-400 shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon name="image" className="w-3.5 h-3.5" />
                Image
              </button>
              <button
                type="button"
                onClick={() => setGenerationType("vocal")}
                className={`flex flex-col items-center gap-1 py-1.5 px-2 rounded-full text-[10px] font-medium transition-all ${
                  generationType === "vocal" 
                    ? 'bg-[#1e1f20] text-pink-400 shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon name="vocal" className="w-3.5 h-3.5" />
                Voix
              </button>
            </div>
          </div>

        </div>

        <div className="pt-4 border-t border-[#282a2c] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#9b51e0] to-[#3085fe] flex items-center justify-center text-white">
              <Icon name="user" className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#e3e3e3]">Utilisateur Invité</p>
              <p className="text-[9px] text-emerald-400 flex items-center gap-1 font-mono uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Connecté
              </p>
            </div>
          </div>
        </div>

      </aside>

      {/* CONTENU PRINCIPAL (STYLE GEMINI) */}
      <main className="flex-1 flex flex-col justify-between h-full bg-[#131314] relative">
        
        {/* Top Header */}
        <header className="h-16 px-6 flex items-center justify-between bg-[#131314]/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-full hover:bg-[#282a2c] text-[#e3e3e3] transition-colors"
              title="Masquer / Afficher le menu"
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-indigo-400">
                <Icon name="logo" className="w-6 h-6 animate-pulse" />
              </span>
              <h2 className="font-semibold text-base text-[#e3e3e3] tracking-tight">NEURAL.AI</h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(generationType === "vocal" || messages.some(m => m.audio)) && (
              <div className="flex items-center gap-2 bg-[#1e1f20] px-3 py-1.5 rounded-full border border-slate-800 animate-fade-in">
                <span className="text-[10px] text-slate-400 font-mono uppercase">Voix de réponse :</span>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="bg-transparent text-[#e3e3e3] text-xs outline-none cursor-pointer"
                >
                  {TTS_VOICES.map(v => (
                    <option key={v.id} value={v.id} className="bg-[#1e1f20]">{v.label}</option>
                  ))}
                </select>
              </div>
            )}
            <button 
              onClick={clearChat}
              title="Nouveau chat"
              className="p-2.5 rounded-full hover:bg-[#282a2c] text-slate-400 hover:text-[#e3e3e3] transition-colors"
            >
              <Icon name="trash" className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ZONE DE CHAT */}
        <section className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          
          {messages.length === 0 ? (
            <div className="max-w-3xl mx-auto pt-12 md:pt-20 space-y-12">
              <div className="space-y-3">
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
                  <span className="bg-gradient-to-r from-[#4285f4] via-[#9b51e0] to-[#ec407a] bg-clip-text text-transparent">
                    Bonjour, Développeur.
                  </span>
                </h1>
                <h2 className="text-3xl md:text-4xl font-medium text-[#444746] leading-snug">
                  Entrez du texte ou parlez-moi de vive voix.
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    handlePersonaChange(PERSONAS[1]);
                    handleSendMessage("Code un jeu de Morpion interactif et stylisé en HTML.");
                  }}
                  className="p-5 rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-left transition-all group flex flex-col justify-between h-[150px] border border-transparent hover:border-slate-800"
                >
                  <p className="text-xs text-[#e3e3e3] line-clamp-4 leading-relaxed">Code un jeu de Morpion interactif et stylisé en HTML.</p>
                  <div className="w-8 h-8 rounded-full bg-[#131314] flex items-center justify-center text-slate-400 group-hover:text-white transition-colors">
                    <Icon name="coder" className="w-4 h-4" />
                  </div>
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    handlePersonaChange(PERSONAS[1]);
                    handleSendMessage("Génère une calculatrice néomorphique élégante.");
                  }}
                  className="p-5 rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-left transition-all group flex flex-col justify-between h-[150px] border border-transparent hover:border-slate-800"
                >
                  <p className="text-xs text-[#e3e3e3] line-clamp-4 leading-relaxed">Génère une calculatrice néomorphique moderne.</p>
                  <div className="w-8 h-8 rounded-full bg-[#131314] flex items-center justify-center text-slate-400 group-hover:text-white transition-colors">
                    <Icon name="coder" className="w-4 h-4" />
                  </div>
                </button>

                <button 
                  type="button"
                  onClick={() => handleSendMessage("Génère une illustration abstraite de puce de silicium quantique en 3D.")}
                  className="p-5 rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-left transition-all group flex flex-col justify-between h-[150px] border border-transparent hover:border-slate-800"
                >
                  <p className="text-xs text-[#e3e3e3] line-clamp-4 leading-relaxed">Génère une illustration de puce de silicium quantique en 3D.</p>
                  <div className="w-8 h-8 rounded-full bg-[#131314] flex items-center justify-center text-slate-400 group-hover:text-white transition-colors">
                    <Icon name="artist" className="w-4 h-4" />
                  </div>
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    handlePersonaChange(PERSONAS[4]); // Mode vocal d'accueil
                    startRecording();
                  }}
                  className="p-5 rounded-2xl bg-[#004a77]/20 hover:bg-[#004a77]/30 text-left transition-all group flex flex-col justify-between h-[150px] border border-indigo-500/30"
                >
                  <p className="text-xs text-[#a8c7fa] font-semibold leading-relaxed">Parler directement avec l'assistant vocale maintenant.</p>
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                    <Icon name="mic" className="w-4 h-4 animate-pulse" />
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div 
                    key={message.id} 
                    className={`flex gap-5 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#3b82f6] to-[#ec407a] flex items-center justify-center text-white shrink-0 shadow-lg">
                        <Icon name="logo" className="w-5 h-5" />
                      </div>
                    )}

                    <div className="space-y-2 flex-1 max-w-[90%]">
                      {isUser ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="bg-[#2e2f30] text-[#e3e3e3] px-5 py-3 rounded-2xl rounded-tr-sm text-sm max-w-[85%] leading-relaxed select-text">
                            {message.text}
                          </div>
                          {message.audio && (
                            <div className="mt-1 flex items-center gap-3 bg-[#1e1f20] py-2 px-3.5 rounded-full border border-slate-800 text-xs">
                              <button
                                type="button"
                                onClick={() => toggleAudio(message.id, message.audio)}
                                className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white"
                              >
                                <Icon name={isPlayingAudioId === message.id ? "pause" : "play"} className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-slate-400">Votre vocal</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-[#e3e3e3] leading-relaxed select-text pr-4">
                          
                          {parseMessageContent(message.text).map((segment, index) => {
                            if (segment.type === 'code') {
                              return (
                                <CodePlayground 
                                  key={index} 
                                  code={segment.code} 
                                  language={segment.language} 
                                  showToast={showToast} 
                                />
                              );
                            } else {
                              return (
                                <div key={index} className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed tracking-normal mb-2">
                                  {segment.content}
                                </div>
                              );
                            }
                          })}

                          {message.image && (
                            <div className="mt-5 rounded-2xl overflow-hidden border border-[#2e2f30] shadow-xl max-w-xl bg-[#1e1f20] group relative">
                              <img 
                                src={message.image} 
                                alt="Génération Neural AI" 
                                className="w-full h-auto object-cover max-h-[450px]"
                              />
                              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a 
                                  href={message.image} 
                                  download="neural-ai-image.png"
                                  className="bg-[#1e1f20]/90 hover:bg-[#282a2c] p-2.5 rounded-full text-white transition-colors flex items-center justify-center"
                                  title="Télécharger l'image"
                                >
                                  <Icon name="download" className="w-4 h-4" />
                                </a>
                              </div>
                            </div>
                          )}

                          {message.audio && (
                            <div className="mt-4 p-4 bg-[#1e1f20] border border-[#2e2f30] rounded-2xl max-w-md flex items-center justify-between shadow-lg">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => toggleAudio(message.id, message.audio)}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                    isPlayingAudioId === message.id 
                                      ? 'bg-[#ea4335] text-white animate-pulse' 
                                      : 'bg-[#4285f4] text-white hover:bg-[#357ae8]'
                                  }`}
                                >
                                  <Icon name={isPlayingAudioId === message.id ? "pause" : "play"} className="w-5 h-5 text-white" />
                                </button>
                                <div>
                                  <p className="text-xs font-semibold text-slate-200">Lecture de la réponse vocale</p>
                                  <p className="text-[10px] text-slate-400">Synthèse via voix {ttsVoice}</p>
                                </div>
                              </div>
                              <span className="text-[10px] bg-emerald-950/60 text-emerald-400 px-2 py-1 rounded-full border border-emerald-900 animate-pulse font-mono">
                                VOCAL
                              </span>
                            </div>
                          )}

                          {message.sources && message.sources.length > 0 && (
                            <div className="mt-4 pt-2 border-t border-[#282a2c]">
                              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block mb-2">Sources vérifiées</span>
                              <div className="flex flex-wrap gap-2">
                                {message.sources.map((src, idx) => (
                                  <a 
                                    key={idx}
                                    href={src.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e1f20] border border-slate-800 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                                  >
                                    <Icon name="compass" className="w-3.5 h-3.5" />
                                    {src.title || "Lien externe"}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {message.suggestions && message.suggestions.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2 animate-fade-in">
                              {message.suggestions.map((suggestion, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleSendMessage(suggestion)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#004a77]/30 border border-indigo-500/30 text-xs text-[#a8c7fa] hover:bg-[#004a77]/50 hover:text-white transition-colors shadow-lg"
                                >
                                  <Icon name="sparkle" className="w-3 h-3 text-amber-400" />
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="flex gap-5 max-w-3xl mx-auto">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#3b82f6] to-[#ec407a] flex items-center justify-center text-white shrink-0">
                <Icon name="logo" className="w-5 h-5 animate-spin" />
              </div>
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-[#2e2f30] rounded-full w-3/4 animate-pulse" />
                <div className="h-4 bg-[#2e2f30] rounded-full w-1/2 animate-pulse" />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </section>

        {/* CONTENEUR DE RECHERCHE FLOTTANT */}
        <footer className="p-4 md:p-6 bg-gradient-to-t from-[#131314] via-[#131314] to-transparent">
          <div className="max-w-3xl mx-auto space-y-4">
            
            {/* Visualisation de l'état d'enregistrement vocal */}
            {isRecording && (
              <div className="flex items-center justify-between bg-rose-950/40 border border-rose-900 rounded-2xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                  <p className="text-sm font-semibold text-rose-300">Enregistrement de votre message vocal en cours...</p>
                </div>
                {/* Visualiseur de vagues d'ondes simples */}
                <div className="flex gap-1 h-4 items-center">
                  <div className="w-0.5 bg-rose-400 h-2 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-0.5 bg-rose-400 h-4 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-0.5 bg-rose-400 h-3 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <div className="w-0.5 bg-rose-400 h-4 animate-bounce" style={{ animationDelay: '450ms' }} />
                  <div className="w-0.5 bg-rose-400 h-2 animate-bounce" style={{ animationDelay: '600ms' }} />
                </div>
              </div>
            )}

            {/* Pill de Saisie */}
            <div className="relative flex items-center bg-[#1e1f20] rounded-full border border-transparent focus-within:bg-[#282a2c] focus-within:ring-1 focus-within:ring-[#4285f4]/50 transition-all shadow-2xl px-5 py-2.5">
              
              {/* Type indicator */}
              <button
                type="button"
                onClick={() => {
                  const idx = (['text', 'image', 'vocal'].indexOf(generationType) + 1) % 3;
                  const nextMode = ['text', 'image', 'vocal'][idx];
                  setGenerationType(nextMode);
                  showToast(`Mode réglé sur : ${nextMode.toUpperCase()}`, "info");
                }}
                className="w-10 h-10 rounded-full hover:bg-[#37393b] text-slate-400 hover:text-[#e3e3e3] transition-colors flex items-center justify-center shrink-0 mr-1"
                title="Changer de mode"
              >
                <Icon name={generationType} className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  generationType === "image" 
                    ? "Décrivez l'image que vous souhaitez créer..." 
                    : generationType === "vocal"
                      ? "Posez votre question vocale..."
                      : "Saisissez votre question ici..."
                }
                className="w-full bg-transparent border-0 outline-none text-[15px] text-[#e3e3e3] placeholder-[#8e918f] focus:ring-0 py-2"
                disabled={loading || isRecording || isEnhancingPrompt}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />

              {/* Submit, Mic & Stop Recording inside the pill */}
              <div className="flex items-center gap-1.5 shrink-0 ml-2">

                {/* Prompt Enhancer */}
                <button
                  type="button"
                  onClick={handleEnhancePrompt}
                  disabled={!inputMessage.trim() || loading || isEnhancingPrompt || isRecording}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
                    !inputMessage.trim() || loading || isRecording
                      ? 'text-[#444746] cursor-not-allowed'
                      : isEnhancingPrompt
                        ? 'text-amber-400 animate-pulse'
                        : 'text-amber-400 hover:bg-[#37393b] active:scale-95'
                  }`}
                  title="Améliorer le prompt avec l'IA"
                >
                  <Icon name="sparkle" className="w-4.5 h-4.5" />
                </button>
                
                {/* Enregistrement Vocal */}
                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="w-10 h-10 rounded-full bg-rose-600 text-white hover:bg-rose-500 flex items-center justify-center transition-all animate-pulse"
                    title="Arrêter l'enregistrement"
                  >
                    <Icon name="stop" className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="w-10 h-10 rounded-full hover:bg-[#37393b] text-[#a8c7fa] hover:text-white flex items-center justify-center transition-all"
                    title="Enregistrer un message vocal"
                    disabled={loading}
                  >
                    <Icon name="mic" className="w-5 h-5" />
                  </button>
                )}

                {/* Envoi classique de texte */}
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={loading || !inputMessage.trim() || isRecording}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    !inputMessage.trim() || loading || isRecording
                      ? 'text-[#444746] cursor-not-allowed'
                      : 'text-[#a8c7fa] hover:bg-[#37393b] active:scale-95'
                  }`}
                >
                  <Icon name="send" className="w-5 h-5" />
                </button>
              </div>

            </div>

            <p className="text-[11px] text-center text-[#8e918f] leading-normal px-4">
              Pour une réponse vocale automatique en envoyant du texte, activez l'icône de microphone/format de réponse en bas de la barre latérale.
            </p>

          </div>
        </footer>

      </main>

    </div>
  );
}


```
