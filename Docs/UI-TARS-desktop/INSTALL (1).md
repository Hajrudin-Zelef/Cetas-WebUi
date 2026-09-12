# UI-TARS SDK — installation avec ton serveur d'inférence local

## Méthode recommandée : npm (pas le zip)

Le zip fourni est pour lecture/référence — ces packages font partie d'un monorepo
avec des dépendances internes (`workspace:*`) qui ne se résolvent pas hors du repo.
Pour un vrai projet, installe plutôt les packages publiés :

```bash
npm install @ui-tars/sdk @ui-tars/operator-nut-js
```

## Fichiers du zip (pour lecture / comprendre le code)

- `sdk/` — le cœur : classe `GUIAgent`, `UITarsModel`, parsing des actions
- `operators/nut-js/` — pilote souris/clavier/capture d'écran cross-platform
- `action-parser/` — convertit la sortie texte du modèle (`click(start_box=...)`) en coordonnées réelles
- `sdk.md` — la doc complète déjà vue plus haut

## Brancher sur Ollama / llama.cpp / LM Studio

Le SDK attend une API **compatible OpenAI** (`baseURL` + `apiKey` + `model`),
avec support des images en base64 dans les messages (format vision).

### LM Studio — normalement le plus simple
LM Studio expose déjà un serveur local compatible OpenAI avec support vision.
1. Charge le modèle `UI-TARS-1.5-7B` (GGUF si dispo, sinon safetensors selon ton runtime) dans LM Studio.
2. Démarre le serveur local (Developer tab → Start Server), note le port (souvent `http://localhost:1234/v1`).
3. Config côté SDK :
```ts
model: {
  baseURL: 'http://localhost:1234/v1',
  apiKey: 'lm-studio', // valeur bidon, LM Studio ne vérifie pas la clé par défaut
  model: 'ui-tars-1.5-7b', // nom exact tel que chargé dans LM Studio
}
```

### llama.cpp (serveur `llama-server`)
Doit tourner en mode multimodal (`--mmproj` avec le projecteur vision du modèle).
Vérifie que ton build de llama.cpp supporte bien l'entrée image pour ce modèle
précis — le support vision varie selon les architectures VLM.
```bash
./llama-server -m ui-tars-1.5-7b.gguf --mmproj mmproj-ui-tars.gguf --port 8080
```
```ts
model: {
  baseURL: 'http://localhost:8080/v1',
  apiKey: 'none',
  model: 'ui-tars-1.5-7b',
}
```

### Ollama
Le point d'attention : Ollama expose une API compatible OpenAI, mais le support
vision dépend du modèle importé (Modelfile avec `FROM` sur un modèle vision-capable
et un manifest qui déclare la capacité image). Si UI-TARS-1.5-7B n'est pas encore
packagé en tant que modèle Ollama officiel, il faudra soit :
- vérifier s'il existe déjà sur https://ollama.com/library (chercher "ui-tars")
- soit l'importer toi-même via un Modelfile pointant vers les poids GGUF + mmproj

```ts
model: {
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',
  model: 'ui-tars-1.5-7b', // nom tel que défini dans ton Modelfile
}
```

## Point d'attention avant de lancer quoi que ce soit

Vérifie d'abord, avec un simple `curl` manuel envoyant une image en base64 à ton
serveur, que le modèle répond bien un texte structuré exploitable (style
`Thought: ...\nAction: click(start_box='(x,y)')`). Le parsing du SDK
(`action-parser`) est calé sur le format de sortie exact de UI-TARS — un modèle
mal quantifié ou un template de prompt différent peut casser le parsing
silencieusement.

## Exemple minimal une fois le serveur choisi

```ts
import { GUIAgent } from '@ui-tars/sdk';
import { NutJSOperator } from '@ui-tars/operator-nut-js';

const guiAgent = new GUIAgent({
  model: {
    baseURL: 'http://localhost:1234/v1', // adapte selon ton serveur
    apiKey: 'none',
    model: 'ui-tars-1.5-7b',
  },
  operator: new NutJSOperator(),
  maxLoopCount: 25,
  onData: ({ data }) => console.log(data),
  onError: ({ data, error }) => console.error(error, data),
});

await guiAgent.run('ta commande ici');
```
