# Lili

Extension Chrome / Firefox pour traiter du texte sans quitter la page : **traduire**, **reformuler**,
**reformuler + traduire**, **résumer** une sélection, **corriger** un texte, ou **résumer la page
entière**.

Un seul code source, deux manifests générés. Aucun serveur intermédiaire : l’extension appelle
directement l’API du fournisseur choisi. **Chaque tâche peut utiliser une connexion et un modèle
différents** : OVHcloud Olala pour traduire et résumer, OpenRouter pour choisir un modèle par usage,
OpenCode Zen/Go, OpenAI, Anthropic ou Ollama.

![Barre flottante](docs/barre.png)

## Fonctionnalités

| Action | Sur une sélection | Sur un champ texte | Raccourci |
| --- | --- | --- | --- |
| Traduire (FR ↔ EN auto) | oui | **remplace sur place** | `Alt+Maj+T` |
| Reformuler (ton réglable) | oui | **remplace sur place** | `Alt+Maj+R` |
| Reformuler puis traduire | oui | **remplace sur place** | — |
| Résumer | oui | panneau de résultat | `Alt+Maj+D` |
| Corriger orthographe / grammaire | oui | **remplace sur place** | — |
| Résumer la page entière | — | — | `Alt+Maj+S` |

- **Barre flottante** près de la sélection, **menu contextuel** (clic droit), **popup** de l’extension
  (sélection courante, texte collé, ou page entière) et **raccourcis clavier**.
- **Streaming** : la réponse s’affiche au fil de l’eau dans un panneau discret (shadow DOM, aucun
  conflit de style avec la page).
- **Remplacement direct** dans les `input`, `textarea` et zones `contenteditable` (bouton
  « Remplacer », ou automatique via une option). `Ctrl+Z` annule.
- **Résumé de page en map-reduce** : le contenu principal est extrait, découpé, résumé section par
  section, puis fusionné. Les pages longues ne sont pas tronquées silencieusement.
- **Détection de langue FR/EN** pour la traduction automatique (`auto`), ou langue cible imposée.
- **Routage par tâche** : une connexion et un modèle par action, avec connexion de repli.
- **Modèles listés automatiquement** depuis chaque service (OpenRouter, OpenCode, OVHcloud…),
  mis en cache et proposés dans des menus déroulants.
- Interface et prompts en français, **clair / sombre**, réglages complets.

| Panneau de résultat | Routage par tâche |
| --- | --- |
| ![Panneau](docs/panneau.png) | ![Routage](docs/routage.png) |

| Réglages | Popup |
| --- | --- |
| ![Réglages](docs/reglages.png) | ![Popup](docs/popup.png) |

## Installation

### Chrome / Edge / Brave

```bash
npm run build
```

1. Ouvre `chrome://extensions`.
2. Active **Mode développeur**.
3. **Charger l’extension non empaquetée** → choisis `dist/chrome`.
4. Épingle l’icône, puis ouvre les **Réglages** (clic droit sur l’icône → Options).

> `npm run build:zip` produit aussi `dist/lili-chrome.zip` pour le Chrome Web Store.

### Firefox

1. Ouvre `about:debugging#/runtime/this-firefox`.
2. **Charger un module temporaire** → choisis `dist/firefox/manifest.json`.
3. Les réglages s’ouvrent au premier lancement.

Le chargement temporaire disparaît au redémarrage ; pour un usage durable, passe par
`about:addons` → roue dentée → **Installer un module depuis un fichier** avec le `.zip`
(`npm run build:zip`) signé par Mozilla, ou charge le dossier via un profil de développement.

## Configuration

Lili sépare **les connexions** (où appeler : type d’API, URL, clé) et **le routage** (quel modèle
pour quelle tâche).

### 1. Ajouter des connexions

Réglages → **Connexions** → choisir un préréglage → **Ajouter la connexion**.

| Préréglage | URL de base | Modèles (exemples) |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini`, … |
| OpenRouter | `https://openrouter.ai/api/v1` | des centaines (`openai/gpt-4o-mini`, …) |
| OVHcloud AI Endpoints | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | `Olala-v1.0-translate`, `Olala-v1.0-summarise`, … |
| OpenCode Zen | `https://opencode.ai/zen/v1` | `deepseek-v4-flash`, … |
| OpenCode Go | `https://opencode.ai/inference/go/openai/v1` | `kimi-k3`, … |
| Anthropic | `https://api.anthropic.com` | `claude-3-5-haiku-latest`, … |
| Ollama (local) | `http://localhost:11434` | modèles installés |
| Personnalisé | — | Mistral, Groq, vLLM, LiteLLM… |

Pour chaque connexion : clé API, modèle par défaut, puis **Tester**. Les listes de modèles sont
récupérées automatiquement à l’ouverture des réglages (cache de 7 jours) et proposées dans des menus
déroulants ; **Charger les modèles** force un rafraîchissement et « Autre modèle… » permet une
saisie libre. À l’enregistrement, le navigateur demande l’accès aux hôtes concernés — nécessaire
pour contourner CORS.

Les listes viennent de `GET {base}/models` (OpenAI-compatible), `GET /v1/models` (Anthropic) et
`GET /api/tags` (Ollama). Les bases OpenCode `/openai/v1` sont converties en `/v1/models`. Si la
liste est refusée avec la clé (401/403) mais publique sans authentification — cas d’OVHcloud — Lili
réessaie sans clé. Les modèles non conversationnels (TTS, Whisper, embeddings, images) sont filtrés.

### 2. Router les tâches

**Modèles par tâche** associe une connexion et un modèle à chaque action :

| Tâche | Exemple |
| --- | --- |
| Traduction | OVHcloud · `Olala-v1.0-translate` |
| Reformuler + traduire | OpenRouter · un modèle généraliste |
| Reformulation | OpenRouter · … |
| Correction | … |
| Résumé de sélection | OVHcloud · `Olala-v1.0-summarise` |
| Résumé de page | OVHcloud · `Olala-v1.0-summarise` |

- Ligne **Par défaut** : connexion de repli quand une tâche n’en définit pas.
- Connexion laissée sur « Par défaut » : la connexion par défaut est utilisée.
- Modèle vide : le modèle par défaut de la connexion est utilisé.

### Modèles dédiés

- **`Olala-v1.0-translate`** (OVHcloud) est un modèle de traduction seul. Lili le détecte et envoie
  `source_language` / `target_language` en anglais, sans prompt système. Son contexte de 8k tokens
  limite la sélection à **12 000 caractères** (message explicite au-delà). Sur « Reformuler +
  traduire », il traduit sans reformuler.
- **`Olala-v1.0-summarise`** : chat classique, contexte large, adapté aux résumés de page.
- **OpenCode Zen / Go** : utiliser `chat/completions`. Les modèles gratuits réservés au client
  OpenCode renvoient 403 ailleurs ; prendre un modèle payant ou un abonnement Go. L’en-tête de
  session exigé par Go est ajouté automatiquement.
- **OpenRouter** : `HTTP-Referer` / `X-Title` sont optionnels ; Lili envoie `X-Title: Lili`.

**Ollama** : autorise l’origine de l’extension, sinon la requête est refusée :

```bash
OLLAMA_ORIGINS="*" ollama serve
```

### Réglages utiles

- **Routage** : connexion et modèle par tâche, plus une connexion de repli.
- **Traduction** : `FR ↔ EN automatique`, `Toujours vers le français`, `Toujours vers l’anglais`.
- **Langue des résumés** : français ou anglais.
- **Ton** de la reformulation : neutre, professionnel, décontracté, académique.
- **Longueur** du résumé : court, moyen, détaillé.
- **Barre flottante** : afficher/masquer, choisir les actions proposées.
- **Remplacement automatique** : remplace le texte du champ dès la fin du traitement.
- **Limites** : taille maximale d’une sélection et d’une page analysée.

## Utilisation

1. Sélectionne du texte : la barre apparaît au-dessus.
2. Clique une action (ou clic droit → *Traduire / Reformuler / Résumer…*).
3. Le panneau affiche le résultat en streaming :
   - **Remplacer** (champ éditable) — remplace la sélection, `Ctrl+Z` pour annuler ;
   - **Copier** — presse-papiers ;
   - **Relancer** — relance la même demande ;
   - **Fermer** (croix ou bouton en pied) — ferme le panneau, comme `Échap`.

Le bouton **Page** de la barre, le popup et `Alt+Maj+S` lancent le résumé de la page. Le popup permet
aussi de traiter un texte collé.

## Architecture

```
src/
├── manifest.base.json       # commun
├── manifest.chrome.json     # service worker MV3
├── manifest.firefox.json    # event page + gecko id
├── background.js            # stockage, menus, raccourcis, streaming, prompts, map-reduce
├── shared/constants.js      # métadonnées des actions (labels, icônes)
├── content/
│   ├── content.js           # sélection, barre, panneau, extraction, remplacement
│   └── styles.js            # CSS injecté via adoptedStyleSheets (shadow DOM)
├── options/                 # page de réglages
└── popup/                   # popup de l’extension
scripts/
├── build.mjs                # dist/chrome + dist/firefox (+ zip)
├── check.mjs                # syntaxe JS + JSON
└── make-icons.py            # icônes PNG
```

**Flux d’une action** : le content script capture la sélection → ouvre un port
`lili-stream` → le background construit le prompt, appelle l’API en SSE et renvoie les deltas → le
panneau les affiche. Le remplacement se fait dans la page, avec les références DOM conservées au
moment de la sélection.

Points techniques :

- Aucun bundler, aucune dépendance npm : les scripts sont chargés tels quels.
- Le background est un script classique, compatible `service_worker` (Chrome) et `scripts`
  (Firefox).
- L’UI vit dans un shadow root : pas de fuite CSS, pas de blocage par la CSP du site
  (`adoptedStyleSheets`).
- Le stockage contient `connections` (type, URL, clé, modèle) et `routing` (connexion + modèle par
  action) ; l’ancien format à fournisseur unique est migré automatiquement.
- Le service worker est maintenu éveillé pendant les appels longs (keepalive + watchdog 90 s).
- Les erreurs HTTP sont traduites en messages actionnables (401, 404, 429, réseau, délai).

## Développement

```bash
npm run icons     # régénère les icônes PNG (Pillow)
npm run check     # node --check sur tous les scripts + validation JSON
npm run build     # dist/chrome + dist/firefox
```

Après une modification, relance `npm run build` puis :
- Chrome : icône **Recharger** dans `chrome://extensions` ;
- Firefox : **Recharger** dans `about:debugging`.

## Confidentialité

- Le texte sélectionné n’est envoyé qu’au fournisseur configuré, au moment où tu déclenches une
  action.
- Aucune télémétrie, aucun serveur maison, aucun compte.
- La clé API est stockée dans `chrome.storage.local` (profil du navigateur), jamais dans le code.
- Les prompts et les réponses ne sont pas journalisés.

## Limites connues

- Les `input` / `contenteditable` situés **dans un shadow DOM** de la page ne sont pas détectés.
- Éditeurs sur canvas (Google Docs, certains IDE web) : la sélection n’est pas accessible.
- Les **iframes** n’ont pas la barre flottante ; le menu contextuel y fonctionne via le texte de
  sélection (sans remplacement).
- Pages internes du navigateur, PDF natifs et Chrome Web Store : injection interdite par le
  navigateur.
- La détection de langue est une heuristique FR/EN ; les autres langues doivent utiliser une cible
  fixe.
- Les très longues pages sont résumées sur les `maxChunks` premières sections (8 par défaut).
- Modèles de traduction dédiés (`Olala-v1.0-translate`) : 12 000 caractères maximum par sélection.
- Modèles gratuits OpenCode : réservés au client OpenCode, 403 depuis l’extension.

## Dépannage

| Symptôme | Piste |
| --- | --- |
| « Accès refusé (401) » | Clé API invalide ou expirée ; vérifie aussi l’URL de base. |
| « Impossible de joindre l’API » | URL erronée, service arrêté, ou autorisation d’hôte refusée : ré-enregistre les réglages et accepte la demande du navigateur. |
| « Endpoint ou modèle introuvable (404) » | L’URL de base doit pointer sur `…/v1` (OpenAI-compatible) ; vérifie le nom du modèle. |
| Ollama répond une erreur réseau | Relance Ollama avec `OLLAMA_ORIGINS="*"`. |
| « 400 source_language / target_language » | Modèle de traduction dédié utilisé sur une autre tâche que la traduction. |
| « 403 » avec OpenCode | Modèle gratuit réservé au client OpenCode : choisis un modèle payant ou Go. |
| Un modèle est refusé après changement de connexion | Vérifie la ligne de routage correspondante et recharge les réglages. |
| « Impossible de lister les modèles » sur OVHcloud | La liste est publique mais refusée avec un token invalide : Lili réessaie sans clé. Si l’erreur persiste, recharge l’extension, puis vérifie l’accès réseau à l’hôte. |
| Pas de barre sur une page | Page interne/PDF, sélection dans une iframe, ou barre désactivée dans les réglages. |
| Rien ne se passe après un rechargement d’extension | Recharge l’onglet : les content scripts ne sont pas réinjectés à chaud. |

## Conventions de développement

- Branches : `main` = stable (releases) ; `dev` = développement et intégration.
- Commits : convention **Gitmoji**, sujet à l’impératif en anglais, corps factuel en puces.
- Code et commentaires en anglais, commentaires courts ; interface, prompts et documentation en
  français.

## Licence

Usage personnel. Adapte et réutilise librement.
