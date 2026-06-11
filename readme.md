# NEURAL.AI - Guide d'installation

## Structure du projet

```
NEURAL.AI/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx
    ├── index.css
    └── App.jsx   ← ton fichier app.jsx renommé
```

## Étapes d'installation

### 1. Préparer le dossier
Crée un dossier `NEURAL.AI` et place tous les fichiers fournis dedans.
Copie ton `app.jsx` dans `src/` et renomme-le `App.jsx`.

### 2. Installer les dépendances
```bash
npm install
```

### 3. Ajouter ta clé API Gemini
Dans `src/App.jsx`, ligne 5, remplace :
```js
const apiKey = "";
```
par ta clé Google AI Studio :
```js
const apiKey = "AIza...ta_cle_ici";
```

> ⚠️ Ne pousse JAMAIS ce fichier avec la clé sur GitHub.
> Utilise une variable d'environnement `.env` pour la prod :
> ```
> VITE_GEMINI_KEY=AIza...ta_cle
> ```
> Puis dans le code : `const apiKey = import.meta.env.VITE_GEMINI_KEY;`

### 4. Lancer l'application
```bash
npm run dev
```
Ouvre ensuite `http://localhost:5173` dans ton navigateur.

### 5. Build pour la production (GitHub Pages / Netlify)
```bash
npm run build
```
Les fichiers seront dans le dossier `dist/`.

## Déploiement sur GitHub Pages
1. Build : `npm run build`
2. Déploie le dossier `dist/` avec :
   ```bash
   npm install -g gh-pages
   gh-pages -d dist
   ```

## Note importante sur la clé API
Pour déployer sans exposer ta clé, utilise un proxy backend (comme tu fais déjà avec Render.com pour Amina). Crée un endpoint `/api/gemini` sur ton proxy et appelle-le depuis l'app.

