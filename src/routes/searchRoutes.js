import express from 'express';
import OpenAI from 'openai';
import supabase from '../config/database.js';
import { vectorSearchService } from '../services/vectorSearchService.js';
import { embeddingService } from '../services/openaiService.js';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Search with AI Processing (Test Endpoint)
 * POST /api/search/test
 * 
 * 🧪 Testing endpoint that provides the same AI-processed experience as /api/chat/
 * but WITHOUT creating conversations, saving messages, or requiring visitor IDs.
 * 
 * Perfect for clients to test the exact response they would get without side effects.
 * 
 * Auth: X-API-Key header (client API key)
 * Middleware automatically extracts client_id from the API key
 */
router.post('/test', async (req, res) => {
  try {
    const { 
      query, 
      matchThreshold = 0.4,
      matchCount = 5
    } = req.body;

    // Validate required fields
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: query'
      });
    }

    console.log(`\n🧪 SEARCH TEST - RAG WITH AI PROCESSING`);
    console.log(`📝 Query: "${query}"`);

    // 1. Generate embedding
    const embeddingResult = await embeddingService.generateEmbedding(query);
    
    if (!embeddingResult.success) {
      throw new Error(embeddingResult.error);
    }

    const embedding = embeddingResult.embedding;
    console.log(`✅ Generated embedding (${embedding.length} dimensions)`);

    // 2. Search knowledge base
    console.log(`🔍 Searching knowledge base...`);
    const searchResult = await vectorSearchService.searchSimilarChunks(
      embedding,
      req.clientId,
      { matchThreshold, matchCount }
    );

    if (!searchResult.success) {
      throw new Error(searchResult.error);
    }

    console.log(`✅ Found ${searchResult.results.length} relevant chunks`);

    // 3. Get client info for context
    const { data: client } = await supabase
      .from('clients')
      .select('company_name, website_url')
      .eq('id', req.clientId)
      .single();

    const companyName = client?.company_name || 'our company';
    console.log(`👤 Client: ${companyName} (ID: ${req.clientId})`);

    // 4. Build RAG context from search results
    let ragContext = '';
    let contextSources = [];

    if (searchResult.results.length > 0) {
      // Log chunks being used
      console.log('\n📄 Chunks Found:');
      searchResult.results.forEach((result, i) => {
        console.log(`  ${i + 1}. [${Math.round(result.similarity * 100)}%] ${result.url}`);
      });

      ragContext = searchResult.results
        .map((result, index) => {
          return `[Source ${index + 1}: ${result.url}]\n${result.text}`;
        })
        .join('\n\n---\n\n');

      contextSources = searchResult.results.map(r => ({
        url: r.url,
        similarity: Math.round(r.similarity * 100) / 100
      }));

      console.log(`\n📦 Context prepared (${searchResult.results.length} sources)`);
    }
    else {
      console.log('⚠️ No relevant chunks found in knowledge base');
    }

    // 5. Build messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: buildSystemPrompt(companyName, ragContext)
      },
      {
        role: 'user',
        content: query
      }
    ];

    console.log('🤖 Calling OpenAI GPT-4o-mini...');

    // 6. Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    const response = completion.choices[0].message.content;
    console.log('✅ Response generated');

    // 7. Return response (NO DB operations)
    res.json({
      success: true,
      response: response,
      query: query,
      clientName: companyName,
      ...(contextSources.length > 0 && {
        sources: contextSources,
        contextsUsed: contextSources.length,
        resultsCount: searchResult.results.length
      })
    });

  } catch (error) {
    console.error('❌ Search test error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Raw vector search (no AI processing)
 * POST /api/search/raw
 * 
 * Returns just the similarity search results without OpenAI processing.
 * Use this to debug RAG quality and see exact chunks.
 */
router.post('/raw', async (req, res) => {
  try {
    const { 
      query, 
      matchThreshold = 0.4,
      matchCount = 5
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: query'
      });
    }

    console.log(`🔍 RAW SEARCH (no AI processing)`);
    console.log(`📝 Query: "${query}"`);

    // Generate embedding
    const embeddingResult = await embeddingService.generateEmbedding(query);
    
    if (!embeddingResult.success) {
      throw new Error(embeddingResult.error);
    }

    const embedding = embeddingResult.embedding;
    console.log(`✅ Generated embedding (${embedding.length} dimensions)`);

    // Search
    const searchResult = await vectorSearchService.searchSimilarChunks(
      embedding,
      req.clientId,
      { matchThreshold, matchCount }
    );

    if (!searchResult.success) {
      throw new Error(searchResult.error);
    }

    console.log(`✅ Found ${searchResult.results.length} similar chunks`);

    res.json({
      success: true,
      query,
      threshold: matchThreshold,
      resultsCount: searchResult.results.length,
      results: searchResult.results
    });

  } catch (error) {
    console.error('❌ Raw search error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Get search statistics
 * GET /api/search/stats
 * 
 * Auth: X-API-Key header (client API key)
 * Middleware automatically extracts client_id from the API key
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await vectorSearchService.getStats(req.clientId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Error in stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get search statistics
 * GET /api/search/stats
 * 
 * Auth: X-API-Key header (client API key)
 * Middleware automatically extracts client_id from the API key
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await vectorSearchService.getStats(req.clientId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Error in stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Helper Functions
// ============================================

/**
 * Build system prompt with RAG context
 */
function buildSystemPrompt(companyName, ragContext) {
  const basePrompt = `You are a helpful AI assistant for ${companyName}.

Your role is to:
- Answer questions about the company's services, expertise, and offerings
- Be friendly, professional, and concise
- If you don't know something, politely say so`;

  if (ragContext && ragContext.trim().length > 0) {
    return `${basePrompt}

Use the following information from the company's website to answer questions:

${ragContext}

Instructions:
- Answer naturally based on the context provided
- Keep responses conversational
- If the context doesn't cover the question, use general knowledge but note they should contact the team for specifics`;
  }

  return basePrompt;
}

export default router;
