import express from 'express';
import { vectorSearchService } from '../services/vectorSearchService.js';
import { embeddingService } from '../services/openaiService.js';

const router = express.Router();

/**
 * Test vector similarity search
 * POST /api/search/test
 */
router.post('/test', async (req, res) => {
  try {
    const { 
      query, 
      matchThreshold = 0.4,
      matchCount = 5 
    } = req.body;

    console.log(`🔍 Search query: "${query}"`);
    console.log(`🎯 Threshold: ${matchThreshold}, Count: ${matchCount}`);

    // Generate embedding
    const embeddingResult = await embeddingService.generateEmbedding(query);
    
    if (!embeddingResult.success) {
      throw new Error(embeddingResult.error);
    }

    // ✅ Extract JUST the embedding array
    const embedding = embeddingResult.embedding;
    
    console.log(`✅ Generated embedding (${embedding.length} dimensions)`);
    console.log(`🔍 Searching for similar chunks...`);
    
    // Search with custom threshold
    const searchResult = await vectorSearchService.searchSimilarChunks(
      embedding,  // Just the array, not the whole object
      req.clientId,
      { matchThreshold, matchCount }
    );

    // ✅ Handle the response structure correctly
    if (!searchResult.success) {
      throw new Error(searchResult.error);
    }

    console.log(`✅ Found ${searchResult.results.length} similar chunks`);

    res.json({
      success: true,
      query,
      threshold: matchThreshold,
      resultsCount: searchResult.results.length,
      results: searchResult.results  // ✅ Access .results property
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
 * Get search statistics
 * GET /api/search/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const clientId = req.clientId;
    const result = await vectorSearchService.getStats(clientId);

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

export default router;
