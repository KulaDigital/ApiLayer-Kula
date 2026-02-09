import express from 'express';
import scraperService from '../services/scraperService.js';
import chunkingService from '../services/chunkingService.js';

const router = express.Router();

/**
 * ✅ NEW: Helper middleware to enforce client role-based access
 * - super_admin: Can access any client's data
 * - client: Can only access their own client's data
 * - API key: Can access their associated client's data (no role checking)
 * 
 * Usage: Pass targetClientId or request will use authenticated user's client
 */
const enforceClientAccess = (req, res, next) => {
  // If using API key auth, skip role checking (legacy support)
  if (req.authType === 'api_key') {
    return next();
  }

  // Bearer token auth - apply role-based access
  if (req.authType === 'bearer') {
    // super_admin can access any client
    if (req.userRole === 'super_admin') {
      return next();
    }

    // client role - compare clientId with req.query.client_id if provided
    if (req.userRole === 'client') {
      const requestedClientId = req.query.client_id || req.body?.client_id;
      
      // If requesting a specific client_id, verify it matches their client
      if (requestedClientId && parseInt(requestedClientId) !== parseInt(req.clientId)) {
        return res.status(403).json({
          error: 'Access denied: You can only access your own client data'
        });
      }
      
      return next();
    }

    // If role is neither super_admin nor client (shouldn't happen due to scraperAuth check)
    return res.status(403).json({
      error: 'Insufficient permissions'
    });
  }

  next();
};

/**
 * METHOD 1: Batch scrape specific URLs (max 50 URLs)
 * 
 * Auth:
 * - Client role: Bearer token (dashboard auth) OR X-API-Key
 * - Super admin: X-API-Key REQUIRED (to identify which client to work with)
 */
router.post('/scrape-batch', async (req, res) => {
    try {
        const { urls } = req.body;

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({
                error: 'URLs array is required (max 50 URLs)'
            });
        }

        if (urls.length > 50) {
            return res.status(400).json({
                error: 'Too many URLs. Maximum 50 per batch. Use /crawl-domain for larger scrapes.'
            });
        }

        // Validate authentication and client_id
        if (!req.clientId) {
            return res.status(401).json({
                error: 'X-API-Key header is required for scraper endpoints'
            });
        }

        // For super_admin, require X-API-Key (not Bearer token)
        if (req.userRole === 'super_admin' && req.authType === 'bearer') {
            return res.status(401).json({
                error: 'Super admin users must use X-API-Key header for scraper endpoints'
            });
        }

        const result = await scraperService.scrapeBatch(req.clientId, urls);

        res.json({
            message: 'Batch scraping completed',
            ...result
        });

    } catch (error) {
        console.error('Batch scrape error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * METHOD 2: Crawl entire domain (async, returns jobId)
 * 
 * Auth:
 * - Client role: Bearer token (dashboard auth) OR X-API-Key
 * - Super admin: X-API-Key REQUIRED (to identify which client to work with)
 */
router.post('/crawl-domain', async (req, res) => {
    try {
        const { websiteUrl } = req.body;

        if (!websiteUrl) {
            return res.status(400).json({ error: 'websiteUrl is required' });
        }

        // Validate authentication and client_id
        if (!req.clientId) {
            return res.status(401).json({
                error: 'X-API-Key header is required for scraper endpoints'
            });
        }

        // For super_admin, require X-API-Key (not Bearer token)
        if (req.userRole === 'super_admin' && req.authType === 'bearer') {
            return res.status(401).json({
                error: 'Super admin users must use X-API-Key header for scraper endpoints'
            });
        }

        const result = await scraperService.crawlDomain(req.clientId, websiteUrl);

        res.json(result);

    } catch (error) {
        console.error('Domain crawl error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get job status and progress
 */
router.get('/job/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await scraperService.getJobStatus(jobId);

        res.json({
            jobId: job.id,
            status: job.status,
            websiteUrl: job.website_url,
            progress: {
                totalUrls: job.total_urls,
                scraped: job.scraped_count,
                failed: job.failed_count,
                chunksCreated: job.chunks_created || 0,
                percentage: job.total_urls > 0
                    ? Math.round((job.scraped_count / job.total_urls) * 100)
                    : 0
            },
            startedAt: job.started_at,
            completedAt: job.completed_at,
            error: job.error_message
        });

    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all scraped URLs (returns list of URLs with chunk counts)
 * 
 * Auth: X-API-Key header REQUIRED (to identify client_id)
 * Note: Bearer token (super_admin) cannot be used as super_admin has no client_id
 */
router.get('/content', enforceClientAccess, async (req, res) => {
    try {
        // Scraper endpoints require X-API-Key auth (not Bearer token)
        if (!req.clientId) {
            return res.status(401).json({
                error: 'X-API-Key header is required for scraper endpoints'
            });
        }

        const content = await scraperService.getClientContent(req.clientId);

        res.json({
            count: content.length,
            content: content.map(item => ({
                url: item.url,
                pageTitle: item.page_title,
                totalChunks: item.total_chunks,
                scrapedAt: item.source_scraped_at
            }))
        });

    } catch (error) {
        console.error('Get content error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get chunks for a specific URL
 * 
 * Auth: X-API-Key header REQUIRED (to identify client_id)
 * Note: Bearer token (super_admin) cannot be used as super_admin has no client_id
 */
router.get('/chunks/:url', enforceClientAccess, async (req, res) => {
    try {
        // Scraper endpoints require X-API-Key auth (not Bearer token)
        if (!req.clientId) {
            return res.status(401).json({
                error: 'X-API-Key header is required for scraper endpoints'
            });
        }

        const url = decodeURIComponent(req.params.url);

        const result = await chunkingService.getChunks(req.clientId, url);

        if (result.success) {
            res.json({
                url: url,
                chunkCount: result.chunks.length,
                chunks: result.chunks.map(chunk => ({
                    id: chunk.id,
                    chunkIndex: chunk.chunk_index,
                    text: chunk.chunk_text,
                    wordCount: chunk.word_count,
                    totalChunks: chunk.total_chunks
                }))
            });
        } else {
            res.status(500).json({ error: result.error });
        }

    } catch (error) {
        console.error('Error getting chunks:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all chunks for client
 * 
 * Auth: X-API-Key header REQUIRED (to identify client_id)
 * Note: Bearer token (super_admin) cannot be used as super_admin has no client_id
 */
router.get('/chunks', enforceClientAccess, async (req, res) => {
    try {
        // Scraper endpoints require X-API-Key auth (not Bearer token)
        if (!req.clientId) {
            return res.status(401).json({
                error: 'X-API-Key header is required for scraper endpoints'
            });
        }

        const limit = req.query.limit ? parseInt(req.query.limit) : 100;

        const result = await chunkingService.getAllChunks(req.clientId, limit);

        if (result.success) {
            res.json({
                totalChunks: result.count,
                showing: result.chunks.length,
                chunks: result.chunks
            });
        } else {
            res.status(500).json({ error: result.error });
        }

    } catch (error) {
        console.error('Error getting all chunks:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get chunk statistics
 * 
 * Auth: X-API-Key header REQUIRED (to identify client_id)
 * Note: Bearer token (super_admin) cannot be used as super_admin has no client_id
 */
router.get('/chunk-stats', enforceClientAccess, async (req, res) => {
    try {
        // Scraper endpoints require X-API-Key auth (not Bearer token)
        if (!req.clientId) {
            return res.status(401).json({
                error: 'X-API-Key header is required for scraper endpoints'
            });
        }

        const result = await chunkingService.getChunkStats(req.clientId);

        if (result.success) {
            res.json(result.stats);
        } else {
            res.status(500).json({ error: result.error });
        }

    } catch (error) {
        console.error('Error getting chunk stats:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Delete chunks for a URL
 * 
 * Auth: X-API-Key header REQUIRED (to identify client_id)
 * Note: Bearer token (super_admin) cannot be used as super_admin has no client_id
 */
router.delete('/chunks/:url', enforceClientAccess, async (req, res) => {
    try {
        // Scraper endpoints require X-API-Key auth (not Bearer token)
        if (!req.clientId) {
            return res.status(401).json({
                error: 'X-API-Key header is required for scraper endpoints'
            });
        }

        const url = decodeURIComponent(req.params.url);

        const result = await chunkingService.deleteChunks(req.clientId, url);

        if (result.success) {
            res.json({ message: 'Chunks deleted successfully', url });
        } else {
            res.status(500).json({ error: result.error });
        }

    } catch (error) {
        console.error('Error deleting chunks:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
