const FAQ_CATEGORIES = [
    { id: 'general', label: 'Général' },
    { id: 'learn', label: 'Usage' },
    { id: 'troubleshoot', label: 'Problèmes' }
];

const FAQ_DATA = [
    // ==========================================
    //                 GÉNÉRAL
    // ==========================================
    {
        category: 'general',
        question: "Qu'est-ce que Cetas ?",
        answer: "Cetas est une <strong>interface de discussion IA multi-modèles</strong> axée sur la confidentialité. Entièrement exécutée dans votre navigateur, elle fonctionne sans serveur distant. Vos conversations, réglages et clés API restent <strong>strictement locaux</strong> sur votre machine.<br><br>L'outil vous permet d'interroger les meilleures IA du marché (OpenAI, Anthropic, Google, Mistral, modèles locaux, etc.) depuis une interface unifiée. Il utilise vos propres clés API, que vous pouvez facilement configurer grâce aux boutons de redirection présents dans les paramètres de l'application."
    },
    {
        category: 'general',
        question: "Mes données sont-elles en sécurité ?",
        answer: "<strong>Oui, totalement.</strong> Toutes vos conversations, rôles et prompts sont stockés <strong>uniquement dans votre navigateur</strong> (IndexedDB et localStorage).<br><br>Aucune donnée ne transite par nos serveurs. Les requêtes sont envoyées <strong>directement</strong> depuis votre navigateur vers les fournisseurs d'IA (OpenAI, Anthropic, etc.) grâce à vos propres clés API.<br><br><strong>Important :</strong> pour garantir cette sécurité, Cetas doit être utilisé sur un <strong>ordinateur personnel non accessible au public</strong>. Ne l'installez jamais sur un hébergement en ligne (mutualisé, VPS, etc.) : dans ce cas, vos données et vos clés API seraient exposées et insuffisamment protégées."
    },
    {
        category: 'general',
        question: "Comment le coût de mes conversations est-il calculé ?",
        answer: "Les fournisseurs d'IA facturent à l'usage basé sur les <strong>tokens</strong> (1 token représente environ 3/4 d'un mot). Chaque modèle applique un tarif spécifique pour les tokens lus en entrée (votre prompt) et les tokens générés en sortie (la réponse de l'IA).<br><br>Cetas calcule ces coûts <strong>en temps réel</strong> en multipliant le nombre de tokens consommés par les tarifs officiels au million de tokens de chaque modèle. Ce calcul vous est fourni à titre indicatif pour vous aider à suivre votre budget, le prélèvement réel étant effectué directement sur le compte de votre fournisseur d'API.<br><br><strong>Cas particulier d'OpenRouter :</strong> pour les modèles utilisés via OpenRouter, le coût affiché par Cetas <strong>n'est pas une estimation</strong> mais le <strong>coût réel facturé</strong>, retourné par l'API d'OpenRouter à chaque échange. Vous bénéficiez donc d'une précision parfaite, marge incluse, sans écart possible avec votre solde OpenRouter."
    },
    {
        category: 'general',
        question: "Qu'est-ce qu'un prompt ?",
        answer: "Un prompt est le <strong>message que vous envoyez à l'IA</strong> : votre question, votre demande ou votre instruction. C'est à partir de ce texte que l'IA génère sa réponse. Plus votre prompt est précis et détaillé, plus la réponse sera pertinente.<br><br><strong>Exemple :</strong> « Rédige un e-mail professionnel pour refuser poliment une invitation à un séminaire, en remerciant l'organisateur et en proposant de rester informé des prochaines éditions. »<br><br>Dans Cetas, vous tapez votre prompt dans le champ de saisie en bas de l'écran. Le <strong>bouton dédié dans la barre de saisie</strong> vous permet d'insérer rapidement un prompt enregistré. Pour <strong>créer, modifier ou supprimer</strong> vos prompts enregistrés, cliquez sur le bouton <strong>« Prompts »</strong> du menu de gauche."
    },
    {
        category: 'general',
        question: "Qu'est-ce qu'un rôle ?",
        answer: "Un rôle (aussi appelé <em>system prompt</em>) est une <strong>instruction de fond</strong> que vous donnez à l'IA avant même de commencer à lui parler. Elle s'applique à <strong>toute la conversation</strong> et conditionne la façon dont l'IA va se comporter, répondre et se présenter. Le rôle est <strong>facultatif</strong> : sans rôle, l'IA répond de façon généraliste.<br><br>Concrètement, un rôle permet de dire à l'IA : <em>« Tu es X, tu fais Y, tu t'exprimes de telle façon »</em>. Cela évite de répéter ce contexte à chaque message.<br><br>Pour définir le rôle d'une conversation, ouvrez le <strong>volet de droite</strong> en cliquant sur l'icône ⚙ située à droite de la zone de saisie. Vous pouvez y saisir un rôle manuellement ou en sélectionner un parmi vos rôles enregistrés."
    },
    {
        category: 'general',
        question: "Quelle différence entre un prompt et un rôle ?",
        answer: "Le <strong>prompt</strong> (aussi appelé <em>prompt utilisateur</em>) est le message que vous écrivez à chaque échange : votre question ou votre demande du moment. Il change à chaque message.<br><br>Le <strong>rôle</strong> (aussi appelé <em>prompt système</em>) est une instruction envoyée en arrière-plan à l'IA <strong>avant chaque échange</strong>. Il reste actif pendant toute la conversation et influence chacune des réponses de l'IA.<br><br>Le prompt système a <strong>plus de poids</strong> que le prompt utilisateur dans le comportement de l'IA. Il peut par exemple imposer un ton, un format de réponse, ou même <strong>interdire certains types de demandes</strong>."
    },
    {
        category: 'general',
        question: "Est-ce que supprimer une conversation supprime aussi les médias qu'elle contient ?",
        answer: "<strong>Oui.</strong> Dans Cetas, les images et fichiers que vous joignez sont stockés <strong>directement à l'intérieur de la conversation</strong> (encodés dans les messages). Quand vous supprimez une conversation, les médias qu'elle contenait disparaissent avec elle.<br><br><strong>Le sens inverse n'est pas vrai :</strong> supprimer un média depuis l'onglet <em>Stockage > Médias</em> ne supprime que la pièce jointe correspondante, la conversation et ses messages texte restent intacts.<br><br>Cela vous permet, depuis l'onglet <strong>Configuration > Stockage > Médias</strong>, de <strong>libérer de l'espace en ne supprimant que les pièces jointes lourdes</strong> (PDF volumineux, images haute définition…) tout en conservant l'historique des échanges. Vous pouvez aussi <strong>télécharger une sélection de médias</strong> avant de les supprimer : un seul fichier est récupéré tel quel, plusieurs sont regroupés dans une archive ZIP."
    },
    {
        category: 'general',
        question: "Pourquoi mes conversations supprimées apparaissent-elles encore dans le coût total ?",
        answer: "C'est <strong>volontaire</strong>. Quand vous supprimez une conversation, Cetas effectue une <strong>suppression « douce »</strong> : le contenu des messages est intégralement effacé (vous ne pouvez plus les lire ni les restaurer), mais les <strong>métadonnées de coût</strong> sont conservées :<ul><li>Nombre de tokens en entrée et en sortie</li><li>Coût estimé en dollars</li><li>Modèle(s) utilisé(s) et répartition par modèle</li><li>Date de la conversation</li></ul>L'objectif est de <strong>préserver l'intégrité de votre tableau de bord et de votre suivi de budget</strong>. Sans cette mécanique, la suppression d'une conversation ferait baisser artificiellement les statistiques mensuelles ou hebdomadaires, et le suivi du budget perdrait toute fiabilité.<br><br>Concrètement, une conversation supprimée :<ul><li>n'apparaît plus dans la liste de gauche ni dans les recherches,</li><li>ne contient plus aucun message,</li><li>continue de compter dans le total des tokens et le coût cumulé.</li></ul>Pour <strong>tout effacer définitivement</strong> (y compris les métadonnées), il faut vider les données du site dans les réglages de votre navigateur."
    },
      {
        category: 'general',
        question: "Qu'est-ce qu'OpenRouter et à quoi ça sert dans Cetas ?",
        answer: "<strong>OpenRouter</strong> est un <em>agrégateur</em> de fournisseurs d'IA : avec <strong>une seule clé API</strong>, vous accédez à <strong>des centaines de modèles</strong> issus de différents éditeurs (OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, xAI, Z.ai, Black Forest Labs / Flux, etc.), y compris des modèles open-source hébergés.<br><br><strong>Quel intérêt par rapport aux clés directes ?</strong><ul><li><strong>Une clé pour tout :</strong> pas besoin d'ouvrir un compte chez chaque fournisseur.</li><li><strong>Accès à des modèles non supportés directement :</strong> tous les modèles présents sur OpenRouter sont disponibles dans Cetas (Flux pour l'image, modèles open-source, fournisseurs non gérés en direct…).</li><li><strong>Facturation centralisée :</strong> un seul crédit prépayé alimente tous les modèles, ce qui simplifie le suivi.</li><li><strong>Bascule entre versions :</strong> idéal pour comparer rapidement plusieurs modèles sur un même prompt.</li></ul><strong>Configuration dans Cetas :</strong><ol><li>Créez un compte sur <a href=\"https://openrouter.ai\" target=\"_blank\">openrouter.ai</a> et générez une clé API.</li><li>Ouvrez <strong>Configuration > API et Modèles</strong> et collez la clé dans le champ <strong>OpenRouter</strong>.</li><li>Cliquez sur le bouton <strong>« Catalogue »</strong> pour télécharger la liste des modèles disponibles, puis <strong>activez ceux que vous souhaitez voir apparaître</strong> dans le sélecteur de modèles.</li></ol><strong>À savoir sur les coûts :</strong> OpenRouter applique une <strong>petite marge</strong> au-dessus du tarif officiel du fournisseur (généralement quelques pour cents). À la différence des autres fournisseurs où Cetas <em>estime</em> le coût à partir des tarifs officiels, pour OpenRouter le coût affiché est <strong>le coût réel facturé</strong>, retourné par l'API à chaque échange — marge déjà incluse. Le suivi de budget est donc parfaitement aligné sur votre solde OpenRouter.<br><br><em>Limite à connaître :</em> certains paramètres avancés (température, top P, seed…) ne sont supportés que par une partie des modèles. Cetas masque automatiquement les réglages non pris en charge par le modèle OpenRouter sélectionné."
    },
    {
        category: 'general',
        question: "Puis-je utiliser des modèles en local ?",
        answer: "<strong>Oui !</strong> Cetas supporte <strong>Ollama</strong> et <strong>LM Studio</strong>.<ol><li>Rendez-vous dans l'onglet <strong>API et Modèles</strong> pour paramétrer LM Studio ou Ollama."
    },
    // ==========================================
    //                APPRENDRE
    // ==========================================
    {
        category: 'learn',
        question: "Quels types de fichiers puis-je analyser avec Cetas ?",
        answer: "Vous pouvez joindre plusieurs types de fichiers à vos requêtes :<br><br><ul><li><strong>Des images</strong> (JPG, PNG, GIF, WebP, etc.) qui seront envoyées aux modèles compatibles avec la vision (multimodaux) pour être analysées ou décrites.</li><li><strong>Des documents PDF</strong> et des <strong>fichiers texte ou Markdown</strong>.</li></ul>L'extraction du contenu des PDF et des fichiers texte se fait <strong>directement et localement dans votre navigateur</strong>. Seul le texte extrait est ensuite envoyé à l'IA pour analyse, garantissant que vos documents originaux ne transitent pas par des serveurs tiers inutiles."
    },
    {
        category: 'learn',
        question: "Comment générer des images avec l'IA ?",
        answer: "Plusieurs modèles intégrés à Cetas permettent de créer des images (notamment Gemini, les modèles d'OpenAI ou tout un tas d'autres via OpenRouter).<br><br>Pour générer une image, il vous suffit de <strong>sélectionner un modèle spécialisé dans l'image</strong> via le sélecteur en haut de l'écran, puis de décrire précisément ce que vous souhaitez obtenir dans votre prompt."
    },
    {
        category: 'learn',
        question: "Puis-je parler à l'IA ou écouter ses réponses ?",
        answer: "<strong>Oui !</strong> Cetas prend en charge des fonctionnalités vocales bidirectionnelles :<ul><li><strong>Dictée (Speech-to-Text) :</strong> cliquez sur l'icône microphone pour dicter votre prompt. La transcription est assurée par des modèles performants comme Whisper (OpenAI), Gemini ou Mistral.</li><li><strong>Lecture (Text-to-Speech) :</strong> vous pouvez écouter les réponses de l'IA à voix haute en utilisant la synthèse vocale de votre système ou les voix proposées par les différents fournisseurs (OpenAI, Google, Mistral).</li></ul>"
    },
    {
        category: 'learn',
        question: "À quoi servent les catégories ?",
        answer: "Les catégories vous permettent d'<strong>organiser vos conversations par thème</strong> afin de ne pas mélanger les sujets et de retrouver rapidement ce que vous cherchez.<br><br>Vous pouvez par exemple créer des catégories comme « Travail », « Rédaction », « Code » ou « Loisirs », puis assigner chaque conversation à la catégorie correspondante.<br><br>Une fois vos catégories en place, utilisez le <strong>sélecteur de catégorie</strong> dans le menu de gauche pour <strong>filtrer l'affichage</strong> : seules les conversations de la catégorie sélectionnée apparaissent."
    },
    {
        category: 'learn',
        question: "À quoi sert le bouton d'amélioration du prompt ?",
        answer: "Le bouton <strong>« Améliorer le prompt »</strong> dans la barre de saisie utilise l'IA pour <strong>réécrire et enrichir votre prompt</strong> avant de l'envoyer. Il analyse ce que vous avez écrit et le reformule de façon plus claire, plus précise et mieux structurée pour obtenir une meilleure réponse.<br><br>Le prompt amélioré remplace votre texte dans le champ de saisie. Vous pouvez le <strong>relire et le modifier</strong> avant d'envoyer. Si le résultat ne vous convient pas, un bouton <strong>« Rétablir »</strong> vous permet de retrouver votre texte original."
    },
    {
        category: 'learn',
        question: "Comment exporter mes conversations ?",
        answer: "Chaque conversation peut être exportée individuellement en cliquant sur le menu <strong>« ··· »</strong> à côté de son titre. Deux formats sont disponibles :<ul><li><strong>Markdown</strong> - texte brut structuré, idéal pour éditer ou archiver la conversation</li><li><strong>HTML</strong> - conserve la mise en forme, pratique pour lire ou imprimer</li></ul>Pour une <strong>sauvegarde complète</strong> (toutes vos conversations, rôles, prompts et paramètres), utilisez le bouton <strong>« Sauvegardes »</strong> dans le menu de gauche. Cela génère un fichier JSON que vous pouvez réimporter à tout moment."
    },
    {
        category: 'learn',
        question: "Comment fonctionnent les paramètres de génération ?",
        answer: "Ces paramètres sont accessibles dans le volet de droite (icône ⚙ à droite de la zone de saisie). Ils permettent d'ajuster finement le comportement du modèle.<br><br><strong>Température</strong> (0 à 2) : Contrôle la créativité. Basse (0.2) = factuel. Haute (1.5) = créatif.<br><strong>Top P</strong> (0 à 1) : Limite le vocabulaire aux mots les plus probables.<br><strong>Tokens max</strong> : Définit la longueur maximale de la réponse générée.<br><strong>Frequency / Presence Penalty</strong> : Pénalise la répétition des mots ou des idées pour encourager la diversité du texte.<br><br><em>Note : tous les paramètres ne sont pas supportés par tous les fournisseurs.</em>"
    },
    {
        category: 'learn',
        question: "Comment changer ou ajouter des modèles d'IA ?",
        answer: "Les modèles disponibles dans Cetas sont définis dans le fichier <strong>models.js</strong> à la racine de l'application. Vous pouvez l'ouvrir avec n'importe quel éditeur de texte pour ajouter, modifier ou supprimer des modèles.<br><br>Chaque modèle est décrit par des champs précis (id, label, editeur, inputPer1M, outputPer1M, description).<br><br><strong>Attention :</strong> seuls les fournisseurs suivants sont pris en charge en accès direct : openai, anthropic, google, mistral, deepseek, grok, zai, perplexity et local.<br><br><strong>Vous voulez un modèle qui n'est pas dans cette liste ?</strong> Passez par <strong>OpenRouter</strong>. Cet agrégateur propose <strong>des centaines de modèles</strong> (y compris des modèles open-source, expérimentaux ou de fournisseurs non supportés directement par Cetas). Il y a de très fortes chances que le modèle que vous cherchez y soit déjà disponible — sans avoir à toucher à <code>models.js</code>.<br><br>Pour les modèles <strong>OpenRouter</strong>, la liste est récupérée automatiquement depuis l'API d'OpenRouter et activée depuis le <strong>Catalogue</strong> (voir la question dédiée à OpenRouter)."
    },
    {
        category: 'learn',
        question: "Comment fonctionne le suivi de budget ?",
        answer: "Le suivi de budget vous permet de <strong>définir un montant maximum de dépenses</strong> par période (jour, semaine ou mois).<br><br>Activez-le dans <strong>Configuration > Budget</strong>, définissez le montant et la période. Une alerte s'affichera lorsque vous approchez la limite. Les coûts sont estimés d'après le nombre de tokens et les tarifs de chaque fournisseur."
    },


    // ==========================================
    //                PROBLÈMES
    // ==========================================
    {
        category: 'troubleshoot',
        question: "Pourquoi mes conversations ont-elles disparu ?",
        answer: "Les données de Cetas sont stockées dans la <strong>base de données de votre navigateur</strong> (IndexedDB et localStorage). Elles peuvent être effacées si vous :<ul><li>Videz vos cookies ou votre cache</li><li>Supprimez vos données de navigation</li><li>Utilisez un mode de navigation privée</li><li>Atteignez la limite de stockage du navigateur (le navigateur peut alors évincer les données les plus anciennes)</li></ul><strong>Conseil :</strong> exportez régulièrement une sauvegarde via le bouton <strong>« Sauvegardes »</strong> dans le menu de gauche. Vous pourrez réimporter vos données à tout moment.<br><br>Pour <strong>libérer de l'espace sans tout perdre</strong>, ouvrez le panneau <strong>Configuration > Stockage</strong> : il liste vos conversations et vos médias avec leur poids, ce qui permet de cibler ce qui prend le plus de place avant de supprimer."
    },
    {
        category: 'troubleshoot',
        question: "Quelle est la limite de stockage de Cetas ?",
        answer: "Cetas n'impose <strong>aucune limite propre</strong> : c'est votre <strong>navigateur</strong> qui décide de la quantité de données qu'il accepte de garder pour le site. Cette limite (appelée <em>quota</em>) varie selon le navigateur et l'espace disque disponible :<ul><li><strong>Chrome / Edge / Brave :</strong> jusqu'à environ <strong>60 %</strong> de l'espace disque total disponible, partagé entre tous les sites. Les données les plus anciennes peuvent être évincées quand le disque se remplit.</li><li><strong>Firefox :</strong> jusqu'à <strong>50 %</strong> de l'espace disque libre, avec un plafond de <strong>10 Go par site</strong>.</li><li><strong>Safari :</strong> environ <strong>1 Go par site</strong> au départ ; au-delà, Safari demande votre autorisation pour chaque palier supplémentaire. En navigation privée, les données sont effacées à la fermeture.</li></ul>En pratique, pour un usage classique (texte uniquement), vous pouvez stocker <strong>des milliers de conversations</strong> sans atteindre le plafond. La limite se ressent surtout si vous accumulez de nombreux médias (images haute résolution, PDF volumineux, fichiers audio), car ceux-ci sont encodés en base64 et occupent <strong>environ 33 % de plus</strong> que leur taille d'origine.<br><br><strong>Pour suivre votre consommation</strong>, ouvrez l'onglet <strong>Configuration > Stockage</strong> : la barre du haut affiche l'espace utilisé, ventilé par catégorie (textes, images, PDF, audio, vidéo, autres). Si vous approchez de la saturation :<ul><li>Exportez une sauvegarde via le bouton <strong>« Sauvegardes »</strong>.</li><li>Triez vos médias par <strong>« Plus lourds »</strong> et supprimez les pièces jointes que vous n'utilisez plus.</li><li>Supprimez les conversations devenues inutiles.</li></ul>"
    },
    {
        category: 'troubleshoot',
        question: "J'ai un problème avec mes modèles locaux (Ollama / LM Studio)",
        answer: "Si vos modèles locaux ne s'affichent pas dans le sélecteur, voici les causes les plus fréquentes :<br><br><strong>1. Problème de CORS (le plus courant)</strong><br>Votre navigateur bloque les requêtes vers votre serveur local. Pour résoudre cela :<ul><li><strong>Ollama :</strong> définissez la variable d'environnement <code>OLLAMA_ORIGINS=*</code> avant de lancer Ollama.</li><li><strong>LM Studio :</strong> activez l'option <strong>« Enable CORS »</strong> dans les paramètres du serveur local.</li></ul><strong>2. Serveur non démarré ou aucun modèle téléchargé</strong><br>Vérifiez que le serveur tourne bien sur l'URL indiquée et que vous avez préalablement téléchargé au moins un modèle."
    },
    {
        category: 'troubleshoot',
        question: "J'ai un problème ou une suggestion, comment vous contacter ?",
        answer: "Contactez Marexsoft Corporation pour toute question ou suggestion."
    }
];