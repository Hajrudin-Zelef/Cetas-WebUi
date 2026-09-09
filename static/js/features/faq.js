export const FAQ_CATEGORIES = [
  { id: "general", label: "Général" },
  { id: "marexcode", label: "Marexcode" },
  { id: "fonctionnalites", label: "Fonctionnalités" },
  { id: "troubleshoot", label: "Dépannage" }
];

export const FAQ_DATA = [

  // ═══════════════════════════════════════════════════════════════════
  //  GÉNÉRAL
  // ═══════════════════════════════════════════════════════════════════

  { category: "general", question: "Qu'est-ce que Cetas ?",
    answer: "Cetas est un <strong>assistant IA multi-modèles</strong> — une interface de chat privée, sécurisée et gratuite développée par <strong>Marexsoft Corporation</strong>, fondée par <strong>Kouassi Marius</strong>.<br><br>Elle supporte <strong>15 fournisseurs d'IA</strong> : OpenAI, Anthropic, Google Gemini, Mistral, DeepSeek, Grok (xAI), Z.ai/GLM, Perplexity, OpenRouter, Groq, Nvidia, OpenCode, ainsi que les modèles locaux (Ollama, LM Studio, LLaMA.cpp).<br><br>Cetas fonctionne dans votre navigateur et s'accompagne d'un <strong>serveur optionnel</strong> qui protège vos clés API et synchronise vos conversations entre vos appareils." },

  { category: "general", question: "Mes données sont-elles en sécurité ?",
    answer: "<strong>Oui.</strong> Cetas est conçu pour que vous gardiez le contrôle de vos données :<ul><li>Vos <strong>clés API</strong> sont stockées côté serveur — elles ne sont jamais exposées au navigateur.</li><li>Vos <strong>conversations et réglages</strong> sont sauvegardés dans le navigateur et sur le serveur.</li><li>L'accès est protégé par un <strong>compte utilisateur</strong> avec authentification.</li></ul>Important : Cetas doit être utilisé sur un <strong>serveur personnel</strong>. Ne l'installez jamais sur un hébergement mutualisé ou un VPS public." },

  { category: "general", question: "Comment le coût de mes conversations est-il calculé ?",
    answer: "Chaque modèle a un tarif de <strong>calcul par million de tokens</strong> (entrée et sortie séparément). Un token ≈ 3/4 de mot en anglais, ≈ 1 mot en français.<br><br>Cetas comptabilise automatiquement les tokens de chaque message et estime le coût en temps réel. Le <strong>suivi de budget</strong> (Configuration > Budget) vous permet de définir un plafond et d'être averti lorsque vous l'approchez." },

  { category: "general", question: "Qu'est-ce qu'un prompt ?",
    answer: "Un prompt est la <strong>consigne ou la question</strong> que vous envoyez à l'IA. Vous pouvez écrire des prompts libres ou enregistrer des <strong>prompts personnalisés</strong> (Configuration > Prompts) pour les réutiliser." },

  { category: "general", question: "Qu'est-ce qu'un rôle ?",
    answer: "Un rôle est un <strong>prompt système</strong> qui définit le comportement de l'IA au début de la conversation. Par exemple : « Tu es un expert en Python » ou « Tu es un rédacteur créatif ».<br><br>Vous pouvez enregistrer des rôles (Configuration > Rôles) et les appliquer rapidement via le panneau latéral droit." },

  { category: "general", question: "Quelle différence entre un prompt et un rôle ?",
    answer: "<ul><li><strong>Rôle</strong> : appliqué au début de la conversation (system prompt). Définit la personnalité et les règles de l'IA.</li><li><strong>Prompt</strong> : votre message de l'utilisateur. Vous pouvez enrichir un prompt avec le bouton « Améliorer » (IA) avant de l'envoyer.</li></ul>" },

  { category: "general", question: "Est-ce que supprimer une conversation supprime aussi les médias ?",
    answer: "<strong>Non.</strong> Les images et fichiers jointes sont stockés de manière indépendante dans le stockage local du navigateur. La suppression de la conversation ne supprime pas les médias déjà enregistrés." },

  { category: "general", question: "Pourquoi mes conversations supprimées apparaissent-elles encore dans le coût total ?",
    answer: "Le coût total affiché dans le panneau « Suivi » inclut <strong>toutes les conversations de la session en cours</strong>. Les conversations supprimées ne sont plus visibles dans la liste, mais leur coût reste comptabilisé jusqu'au rechargement de la page." },

  { category: "general", question: "Qu'est-ce qu'OpenRouter et à quoi ça sert dans Cetas ?",
    answer: "OpenRouter est un <strong>agrégateur de modèles</strong> qui donne accès à des centaines de modèles (Llama, Mistral, Qwen, Gemma, etc.) via une seule clé API. Dans Cetas, configurez une clé OpenRouter dans Configuration > API et Modèles pour accéder à un catalogue étendu de modèles." },

  { category: "general", question: "Puis-je utiliser des modèles en local ?",
    answer: "<strong>Oui.</strong> Cetas supporte trois moteurs locaux :<ul><li><strong>Ollama</strong> — le plus simple, exécutez <code>ollama serve</code> puis configurez l'URL dans Configuration > API et Modèles.</li><li><strong>LM Studio</strong> — interface graphique pour charger des modèles GGUF.</li><li><strong>LLaMA.cpp</strong> — serveur léger, idéal pour les performances.</li></ul>Les modèles locaux sont gratuits et ne nécessitent aucune clé API." },

  // ═══════════════════════════════════════════════════════════════════
  //  MAREXCODE
  // ═══════════════════════════════════════════════════════════════════

  { category: "marexcode", question: "Qu'est-ce que Marexcode et comment y accéder ?",
    answer: "Marexcode est le <strong>module d'assistance de codage</strong> intégré à Cetas. C'est un éditeur de code complet avec :<ul><li>Explorateur de fichiers workspace</li><li>Chat IA avec outils de code (lecture, écriture, recherche, exécution)</li><li>Sessions sauvegardables</li><li>Système de permissions granulaires</li></ul>Accédez-y via le bouton <strong>« Marexcode »</strong> dans la sidebar de Cetas, ou directement sur <code>/marexcode/</code>." },

  { category: "marexcode", question: "Quels outils sont disponibles dans Marexcode ?",
    answer: "Marexcode fournit une boîte à outils complète :<ul><li><strong>Ls</strong> — explorer l'arborescence du workspace</li><li><strong>Read</strong> — lire le contenu d'un fichier (avec pagination)</li><li><strong>Write</strong> — créer ou écraser un fichier</li><li><strong>Edit</strong> — modifier une portion de fichier (recherche/remplacement)</li><li><strong>Grep</strong> — rechercher un motif dans les fichiers</li><li><strong>Bash</strong> — exécuter des commandes dans un sandbox sécurisé</li><li><strong>Glob</strong> — rechercher des fichiers par pattern</li><li><strong>TodoWrite</strong> — gérer une liste de tâches (virtuel côté client)</li></ul>L'IA utilise ces outils automatiquement pour répondre à vos demandes de codage." },

  { category: "marexcode", question: "Comment fonctionnent les permissions d'écriture ?",
    answer: "Marexcode propose trois niveaux de permission par outil :<ul><li><strong>Allow</strong> — l'outil s'exécute automatiquement</li><li><strong>Ask</strong> — une confirmation vous est demandée avant chaque exécution</li><li><strong>Deny</strong> — l'outil est bloqué</li></ul>Configurez ces permissions dans le <strong>composer</strong> (barre latérale gauche, section Workspace). Les outils en lecture (Read, Ls, Grep) sont toujours accessibles." },

  { category: "marexcode", question: "Comment fonctionne le workspace ?",
    answer: "Le workspace est le <strong>répertoire de travail</strong> de Marexcode. Vous pouvez :<ul><li>Créer des workspaces multiples (un par projet)</li><li>Importer un dossier existant via le bouton Upload</li><li>Ajouter des instructions par projet (fichier MAREXCODE.md)</li><li>Basculer entre les workspaces via la sidebar</li></ul>Le workspace actif est affiché dans la barre d'en-tête du composer." },

  { category: "marexcode", question: "Comment fonctionnent les auto-formatters ?",
    answer: "Après chaque écriture ou modification de fichier (Write/Edit), Marexcode exécute <strong>automatiquement</strong> le formattage adapté :<ul><li><code>.py</code> → Ruff</li><li><code>.js/.ts/.json/.css/.html/.md</code> → Prettier</li></ul>Le formatage est silencieux et n'affecte pas le résultat. Il maintient un style de code propre sans intervention manuelle." },

  { category: "marexcode", question: "Comment fonctionne l'historique undo/redo ?",
    answer: "Chaque opération Write ou Edit est enregistrée dans un journal. Vous pouvez :<ul><li><strong>Annuler</strong> la dernière opération (Ctrl+Z ou bouton Undo)</li><li><strong>Rétablir</strong> l'opération annulée (Ctrl+Y ou bouton Redo)</li></ul>Le journal est persisté côté serveur et survives aux rechargements." },

  { category: "marexcode", question: "Qu'est-ce que MCP et comment l'utiliser ?",
    answer: "<strong>MCP</strong> (Model Context Protocol) permet à Marexcode de se connecter à des <strong>serveurs d'outils externes</strong> pour étendre ses capacités (par exemple : interroger une base de données, appeler une API, accéder au filesystem distant).<br><br>Configurez les serveurs MCP dans <code>mcp.json</code> du workspace. Les outils MCP apparaissent ensuite automatiquement dans la liste d'outils disponibles pour l'IA." },

  { category: "marexcode", question: "Comment importer un projet existant ?",
    answer: "Utilisez le <strong>bouton Upload</strong> dans la sidebar Marexcode :<ul><li>Sélectionnez un dossier depuis votre ordinateur</li><li>Les fichiers sont uploadés dans le workspace actif</li><li>Une limite de 150 Mo / 1000 fichiers s'applique</li></ul>Vous pouvez aussi travailler directement sur un dossier déjà présent dans le workspace." },

  // ═══════════════════════════════════════════════════════════════════
  //  FONCTIONNALITÉS
  // ═══════════════════════════════════════════════════════════════════

  { category: "fonctionnalites", question: "Quels types de fichiers puis-je analyser avec Cetas ?",
    answer: "Cetas accepte :<ul><li><strong>Images</strong> — JPG, PNG, GIF, WebP, SVG (analyse multimodale)</li><li><strong>PDF</strong> — extraction de texte et d'images</li><li><strong>Documents</strong> — Word (.docx), Excel (.xlsx)</li><li><strong>Texte</strong> — fichiers texte, Markdown, code source</li></ul>Joignez des fichiers via le bouton 📎 sous le champ de saisie." },

  { category: "fonctionnalites", question: "Comment générer des images avec l'IA ?",
    answer: "Sélectionnez un <strong>modèle image</strong> dans le sélecteur (onglet « Images »), puis décrivez l'image souhaitée.<br><br>Modèles supportés : DALL-E (OpenAI), Imagen (Google), Flux (OpenRouter). Le format et la qualité sont configurables dans le panneau latéral droit (onglet Image)." },

  { category: "fonctionnalites", question: "Puis-je parler à l'IA ou écouter ses réponses ?",
    answer: "<strong>Oui, les deux.</strong><ul><li><strong>Microphone</strong> 🎤 — cliquez pour dicter votre message (STT via Whisper, Voxtral ou Gemini).</li><li><strong>Lecture audio</strong> — activez la synthèse vocale (TTS) dans les paramètres audio pour écouter les réponses.</li></ul>Configurez les fournisseurs vocaux dans Configuration > Fonctionnalités." },

  { category: "fonctionnalites", question: "À quoi servent les catégories ?",
    answer: "Les catégories vous permettent de <strong>classer vos conversations</strong> par thème (travail, personnel, projets…). Sélectionnez une catégorie dans la sidebar pour filtrer les conversations. Les catégories sont gérées via le bouton ⚙ à côté du sélecteur." },

  { category: "fonctionnalites", question: "À quoi sert le bouton d'amélioration du prompt ?",
    answer: "Le bouton ✨ (toolbar sous le champ de saisie) envoie votre prompt à un modèle IA pour le <strong>réécrire de manière plus claire et structurée</strong>. Utile lorsque vos idées sont décousues ou que vous voulez un prompt optimisé pour un modèle spécifique." },

  { category: "fonctionnalites", question: "Comment exporter mes conversations ?",
    answer: "Deux méthodes :<ul><li><strong>Export individuel</strong> — bouton Export en haut de la conversation (Markdown ou HTML)</li><li><strong>Sauvegarde globale</strong> — Configuration > Stockage > Sauvegarder (export JSON complet de toutes les conversations)</li></ul>L'import se fait via le même panneau de stockage." },

  { category: "fonctionnalites", question: "Comment fonctionnent les paramètres de génération ?",
    answer: "Le panneau latéral droit (onglet Général) permet de configurer :<ul><li><strong>Effort de raisonnement</strong> — Faible / Moyen / Max (pour les modèles avec thinking)</li><li><strong>Température</strong> — créativité (0 = précis, 1 = créatif)</li><li><strong>Top P</strong> — diversité du vocabulaire</li><li><strong>Tokens max</strong> — longueur maximale de la réponse</li><li><strong>Pénalités</strong> — fréquence et présence (anti-répétition)</li></ul>Ces paramètres sont sauvegardés par conversation." },

  { category: "fonctionnalites", question: "Comment fonctionne le suivi de budget et les quotas ?",
    answer: "<strong>Budget</strong> (Configuration > Budget) : définissez un plafond mensuel. Cetas vous avertit lorsque vous l'approchez.<br><br><strong>Quotas</strong> (Configuration > Quotas) : affiche les crédits restants chez vos fournisseurs API (utile pour OpenAI, OpenRouter, etc.)." },

  { category: "fonctionnalites", question: "Qu'est-ce que SamAgent et comment ça marche ?",
    answer: "SamAgent est le <strong>routeur intelligent</strong> de Cetas. Il sélectionne automatiquement le meilleur modèle pour chaque requête en fonction :<ul><li>De la complexité de la tâche</li><li>Des modèles disponibles et configurés</li><li>De votre historique</li></ul>Utilisez le modèle « SamAgent » dans le sélecteur pour activer le routage intelligent." },

  { category: "fonctionnalites", question: "Comment fonctionne le mode réflexion (reasoning) ?",
    answer: "Certains modèles (GPT-5, Claude, DeepSeek, Kimi…) supportent un <strong>mode de réflexion</strong> : l'IA « réfléchit » avant de répondre, ce qui améliore la qualité sur les tâches complexes.<br><br>Activez-le via le <strong>menu +</strong> (toggle Réflexion) ou le panneau latéral droit (Effort de raisonnement). Les réponses de réflexion sont repliables dans le chat." },

  { category: "fonctionnalites", question: "Comment utiliser la recherche web intégrée ?",
    answer: "Cliquez sur le bouton 🌐 (toolbar) ou activez-le via le menu +. L'IA cherchera sur le web avant de répondre.<br><br>La chaîne de recherche utilise plusieurs fournisseurs en cascade :<ul><li><strong>Tavily</strong> — recherche IA (clé requise)</li><li><strong>Exa</strong> — recherche sémantique (clé requise)</li><li><strong>Brave Search</strong> — recherche classique (clé requise)</li><li><strong>Jina</strong> — extraction de contenu web (clé requise)</li><li><strong>SearXNG</strong> — agrégateur open-source (optionnel)</li><li><strong>DuckDuckGo</strong> — fallback gratuit sans clé</li></ul>Configurez les clés dans Configuration > Recherche Web." },

  { category: "fonctionnalites", question: "Comment fonctionne le menu « + » ?",
    answer: "Le bouton <strong>+</strong> sous le champ de saisie regroupe :<ul><li><strong>Sélection du modèle</strong> — changer de modèle pour la conversation</li><li><strong>Mode Réflexion</strong> — activer/désactiver le raisonnement</li><li><strong>Effort</strong> — régler la profondeur de réflexion</li><li><strong>Compétences</strong> — activer des prompts préconfigurés (code expert, pédagogue…)</li><li><strong>Recherche web</strong> — activer/désactiver la recherche web</li></ul>Un raccourci pratique pour configurer le comportement de l'IA sans quitter le chat." },

  { category: "fonctionnalites", question: "Comment partager Cetas avec d'autres personnes ?",
    answer: "Cetas est un projet gratuit et open-source. Partagez-le via :<ul><li><strong>GitHub</strong> — <a href=\"https://github.com/Hajrudin-Zelef/Cetas-WebUi\" target=\"_blank\" rel=\"noopener noreferrer\">github.com/Hajrudin-Zelef/Cetas-WebUi</a></li><li><strong>Site officiel</strong> — <a href=\"https://cetas.neva-ci.pro\" target=\"_blank\" rel=\"noopener noreferrer\">cetas.neva-ci.pro</a></li></ul>Deux règles : ne pas vendre Cetas, et le partager uniquement via ces liens." },

  { category: "fonctionnalites", question: "Comment gérer plusieurs utilisateurs ?",
    answer: "L'administrateur peut gérer les utilisateurs dans <strong>Configuration > Utilisateurs</strong> :<ul><li>Créer de nouveaux comptes</li><li>Attribuer des rôles (admin / utilisateur)</li><li>Modifier ou supprimer des comptes</li></ul>Chaque utilisateur a ses propres conversations, réglages et clés API." },

  { category: "fonctionnalites", question: "Comment fonctionnent les favoris ?",
    answer: "Cliquez sur l'<strong>étoile ★</strong> à côté d'un modèle dans le sélecteur pour l'ajouter à vos favoris. Les favoris apparaissent dans la sidebar (section « Favoris ») pour un accès rapide." },

  { category: "fonctionnalites", question: "Comment fonctionne le Canvas ?",
    answer: "Le Canvas est un <strong>éditeur de code intégré</strong> accessible via le bouton dans la toolbar ou le panneau latéral. Il permet de :<ul><li>Éditer du code directement dans le chat</li><li>Créer des snapshots (versions sauvegardées)</li><li>Revenir à une version précédente (rewind)</li></ul>Le Canvas est particulièrement utile pour les projets multi-fichiers." },

  { category: "fonctionnalites", question: "Comment fonctionne le panneau latéral droit ?",
    answer: "Le panneau latéral droit (bouton ⚙ ou 🎨) contient :<ul><li><strong>Onglet Général</strong> — rôle system prompt, paramètres de génération (effort, température, tokens max…)</li><li><strong>Onglet Image</strong> — format, qualité, ratio, paramètres spécifiques aux modèles image</li></ul>Les paramètres sont sauvegardés par conversation et restaurés automatiquement." },

  // ═══════════════════════════════════════════════════════════════════
  //  DÉPANNAGE (axe frontend — Cetas + Marexcode)
  // ═══════════════════════════════════════════════════════════════════

  { category: "troubleshoot", question: "Pourquoi certains modèles n'apparaissent-ils pas dans le sélecteur ?",
    answer: "Plusieurs causes possibles :<ul><li>Vous n'avez pas configuré la clé API du fournisseur (Configuration > API et Modèles)</li><li>Le modèle est désactivé dans le catalogue (onglet Fonctionnalités)</li><li>Le modèle nécessite un abonnement spécifique (OpenAI Pro, Claude Max…)</li></ul>Vérifiez la section « API et Modèles » pour activer/désactiver les modèles visibles." },

  { category: "troubleshoot", question: "Pourquoi mes conversations ont-elles disparu ?",
    answer: "Les conversations sont stockées dans le <strong>stockage local du navigateur</strong>. Elles peuvent disparaître si :<ul><li>Vous avez nettoyé les données du navigateur</li><li>Vous utilisez un navigateur different sans synchronisation serveur</li><li>Vous avez changé d'appareil sans compte serveur</li></ul>Conseil : activez la synchronisation serveur (connexion requise) pour sauvegarder vos conversations automatiquement." },

  { category: "troubleshoot", question: "L'application est lente, que faire ?",
    answer: "Solutions par ordre de priorité :<ul><li><strong>Modèles locaux</strong> — la vitesse dépend de votre matériel (GPU recommandé)</li><li><strong>Modèles cloud rapides</strong> — utilisez Gemini Flash, DeepSeek Flash, ou GPT-5.6 Luna pour les réponses rapides</li><li><strong>Historique</strong> — réduisez la longueur des conversations (une conversation longue = plus de tokens à traiter)</li><li><strong>Navigateur</strong> — fermez les onglets inutiles, videz le cache</li></ul>" },

  { category: "troubleshoot", question: "L'IA répond en anglais alors que je pose en français, que faire ?",
    answer: "Ajoutez une instruction dans le <strong>rôle system prompt</strong> (panneau latéral droit) : « Réponds toujours en français » ou « Réponds dans la langue de l'utilisateur ». Cette instruction est envoyée à chaque message." },

  { category: "troubleshoot", question: "Je reçois une erreur 401 ou « Non authentifié », que faire ?",
    answer: "Erreur d'authentification. Solutions :<ul><li><strong>Clé API invalide</strong> — vérifiez et mettez à jour votre clé dans Configuration > API et Modèles</li><li><strong>Session expirée</strong> — reconnectez-vous (déconnexion > reconnexion)</li><li><strong>Crédits épuisés</strong> — vérifiez votre solde sur le dashboard du fournisseur</li></ul>" },

  { category: "troubleshoot", question: "L'IA refuse de répondre ou dit « je ne peux pas », que faire ?",
    answer: "Le refus vient généralement du <strong>fournisseur d'IA</strong> (politique de contenu). Solutions :<ul><li>Changez de modèle — chaque fournisseur a des politiques différentes</li><li>Reformulez votre demande de manière plus neutre</li><li>Utilisez un modèle open-weight (Llama, Mistral) qui a moins de restrictions</li></ul>" },

  { category: "troubleshoot", question: "Marexcode affiche une erreur au démarrage, que faire ?",
    answer: "Erreurs fréquentes dans Marexcode :<ul><li><strong>« Workspace introuvable »</strong> — recréez un workspace via la sidebar</li><li><strong>« Erreur d'exécution »</strong> — la commande Bash a échoué dans le sandbox. Vérifiez la syntaxe.</li><li><strong>« Permission refusée »</strong> — l'outil est en mode « Ask » ou « Deny ». Changez les permissions dans le composer.</li><li><strong>Page vide après import</strong> — le dossier est peut-être trop volumineux (limite 150 Mo). Découpez-le.</li></ul>" },

  { category: "troubleshoot", question: "Les formats automatiques ne s'appliquent pas, que faire ?",
    answer: "Vérifiez que :<ul><li>Le <strong>formatteur</strong> est installé côté serveur (Ruff pour Python, Prettier pour JS/JSON/CSS/HTML/MD)</li><li>Le fichier a une extension reconnue (.py, .js, .ts, .json, .css, .html, .md)</li><li>Le serveur est en cours d'exécution (les auto-formatters tournent côté serveur)</li></ul>Les erreurs de formatage sont silencieuses — le fichier est tout de même sauvegardé." },

  { category: "troubleshoot", question: "Comment mettre à jour Cetas ?",
    answer: "Si vous utilisez la <strong>version Docker</strong> :<ul><li><code>git pull</code> pour récupérer les mises à jour</li><li><code>docker compose build cetas && docker compose up -d</code></li></ul>Si vous utilisez la <strong>version desktop</strong> (cetas.exe), téléchargez la dernière version depuis le GitHub et relancez l'installateur." },

  { category: "troubleshoot", question: "J'ai un problème ou une suggestion, comment vous contacter ?",
    answer: "Pour toute question, bug ou suggestion :<ul><li><strong>GitHub Issues</strong> — <a href=\"https://github.com/Hajrudin-Zelef/Cetas-WebUi/issues\" target=\"_blank\" rel=\"noopener noreferrer\">Ouvrir un ticket</a></li><li><strong>Site officiel</strong> — <a href=\"https://cetas.neva-ci.pro\" target=\"_blank\" rel=\"noopener noreferrer\">cetas.neva-ci.pro</a></li></ul>N'hésitez pas à signaler les bugs avec des captures d'écran et les étapes pour reproduire le problème." }
];
