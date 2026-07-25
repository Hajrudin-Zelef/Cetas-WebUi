// © Marexsoft Corporation. Fondateur Kouassi Marius.
// --- Tool loop pour recherche web function-calling ---
// Injecté dans streamModel pour les providers sans recherche native.

var TOOL_SEARCH_MAX_ITERATIONS = 3;

// Exécute un tool call (appelé depuis la boucle tool)
async function _executeToolCall(toolCall) {
    var name = toolCall.function.name;
    var args;
    try { args = JSON.parse(toolCall.function.arguments); } catch (e) { args = {}; }

    if (name === 'web_search') {
        var results = await executeWebSearch(args.query || '');
        return { id: toolCall.id, name: name, result: results };
    }
    if (name === 'web_fetch') {
        var content = await executeWebFetch(args.url || '');
        return { id: toolCall.id, name: name, result: content };
    }
    return { id: toolCall.id, name: name, result: { error: 'Unknown tool: ' + name } };
}

// Wrapper streamModel avec boucle function-calling.
// Même signature que streamModel, + _iteration (interne).
async function streamModelWithTools(modelId, conversationHistory, onChunk, onDone, onError, systemPrompt, webSearch, onThinkingChunk, signal, modelParams, fallbackModel, _iteration) {
    if (!_iteration) _iteration = 0;
    var editeur = getModelEditeur(modelId) || (typeof getSearchModelEditeur === 'function' ? getSearchModelEditeur(modelId) : null);
    var provider = PROVIDERS[editeur];

    if (!provider) {
        if (fallbackModel && fallbackModel.model && fallbackModel.provider) {
            console.warn('[tool-search] éditeur inconnu pour ' + modelId + ' → fallback ' + fallbackModel.model);
            return streamModelWithTools(fallbackModel.model, conversationHistory, onChunk, onDone, onError, systemPrompt, false, onThinkingChunk, signal, modelParams, fallbackModel._nextFallback || null, 0);
        }
        onError(new Error('Éditeur inconnu pour le modèle ' + modelId));
        return;
    }

    try {
        var messages = provider.formatMessages(conversationHistory);
        var body = provider.buildBody(modelId, messages, systemPrompt, webSearch, modelParams);
        // S'assurer que les tools sont bien présents
        if (!body.tools || body.tools.length === 0) {
            body.tools = (typeof WEB_SEARCH_TOOLS !== 'undefined') ? WEB_SEARCH_TOOLS : [];
        }

        var response;
        try {
            response = await fetch(provider.getUrl(modelId, webSearch), {
                method: 'POST',
                headers: (typeof proxyHeaders === 'function' ? proxyHeaders(editeur, provider.getHeaders()) : provider.getHeaders()),
                body: JSON.stringify(body),
                signal: signal
            });
        } catch (netErr) {
            if (netErr && netErr.name === 'AbortError') throw netErr;
            throw new Error('Connexion à ' + editeur + ' impossible.');
        }

        if (!response.ok) {
            var errText = await response.text();
            throw new Error(editeur + ' API error ' + response.status + ': ' + errText);
        }

        // Parser avec accumulation tool_calls
        var parse = createChatCompletionsParser(!!onThinkingChunk, {
            extractCitations: function(p) {
                var anns = p.choices && p.choices[0] && p.choices[0].delta && p.choices[0].delta.annotations;
                if (!anns) return null;
                return anns.filter(function(a) { return a.type === 'url_citation' && a.url; }).map(function(a) { return { url: a.url, title: a.title || '' }; });
            },
            extractReasoning: function(p) {
                return (p.choices && p.choices[0] && p.choices[0].delta && p.choices[0].delta.reasoning_content) || null;
            },
            accumulateCitations: true,
            accumulateToolCalls: true
        });

        var fullText = '';

        for await (var raw of readSSE(response)) {
            var events = parse(raw);
            for (var i = 0; i < events.length; i++) {
                var event = events[i];
                if (event.type === 'chunk') {
                    fullText += event.data;
                    onChunk(event.data);
                } else if (event.type === 'thinking' && onThinkingChunk && event.data) {
                    onThinkingChunk(event.data);
                }
            }
        }

        // Flush buffers résiduels
        var flushEvents = parse.flush();
        for (var j = 0; j < flushEvents.length; j++) {
            var fe = flushEvents[j];
            if (fe.type === 'chunk') {
                fullText += fe.data;
                onChunk(fe.data);
            } else if (fe.type === 'thinking' && onThinkingChunk && fe.data) {
                onThinkingChunk(fe.data);
            }
        }

        var result = parse.getResult();
        var usage = result.usage;
        var citations = result.citations;

        // Détection tool calls
        if (parse.hasToolCalls && parse.hasToolCalls() && _iteration < TOOL_SEARCH_MAX_ITERATIONS) {
            var toolCalls = parse.getToolCalls();

            // Exécuter les tools
            var toolResults = [];
            for (var k = 0; k < toolCalls.length; k++) {
                try {
                    var tr = await _executeToolCall(toolCalls[k]);
                    toolResults.push(tr);
                } catch (e) {
                    toolResults.push({ id: toolCalls[k].id, name: toolCalls[k].function.name, result: { error: e.message } });
                }
            }

            // Collecter les URLs de recherche comme citations
            var searchCitations = [];
            for (var m = 0; m < toolResults.length; m++) {
                if (toolResults[m].name === 'web_search' && Array.isArray(toolResults[m].result)) {
                    for (var n = 0; n < toolResults[m].result.length; n++) {
                        searchCitations.push({ url: toolResults[m].result[n].url, title: toolResults[m].result[n].title });
                    }
                }
            }

            // Message assistant avec tool_calls
            var assistantMsg = { role: 'assistant' };
            if (fullText) assistantMsg.content = fullText;
            else assistantMsg.content = null;
            assistantMsg.tool_calls = toolCalls.map(function(tc) {
                return { id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } };
            });

            // Messages tool results
            var toolMsgs = toolResults.map(function(tr) {
                var content = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result);
                return { role: 'tool', tool_call_id: tr.id, content: content };
            });

            // Historique enrichi
            var newHistory = conversationHistory.concat([assistantMsg], toolMsgs);

            // Récursion (webSearch=true pour permettre d'autres recherches si nécessaire)
            return streamModelWithTools(
                modelId, newHistory, onChunk, onDone, onError,
                systemPrompt, true, onThinkingChunk, signal, modelParams,
                fallbackModel, _iteration + 1
            );
        }

        // Pas de tool calls — réponse finale
        // Ajouter les citations de recherche aux citations du parser
        onDone(usage, citations);

    } catch (err) {
        if (err && err.name === 'AbortError') { onDone(null, []); return; }
        if (_iteration > 0 && fallbackModel && fallbackModel.model && fallbackModel.provider) {
            console.warn('[tool-search] échec ' + modelId + ' → fallback ' + fallbackModel.model);
            return streamModelWithTools(fallbackModel.model, conversationHistory, onChunk, onDone, onError, systemPrompt, false, onThinkingChunk, signal, modelParams, fallbackModel._nextFallback || null, 0);
        }
        onError(err);
    }
}
