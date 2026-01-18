import express from 'express';
import scraperService from '../services/scraperService.js';
import chunkingService from '../services/chunkingService.js';

const router = express.Router();

/**
 * METHOD 1: Batch scrape specific URLs (max 50 URLs)
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
 */
router.post('/crawl-domain', async (req, res) => {
    try {
        const { websiteUrl } = req.body;

        if (!websiteUrl) {
            return res.status(400).json({ error: 'websiteUrl is required' });
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
 */
router.get('/content', async (req, res) => {
    try {
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
 */
router.get('/chunks/:url', async (req, res) => {
    try {
        const clientId = req.clientId;
        const url = decodeURIComponent(req.params.url);

        const result = await chunkingService.getChunks(clientId, url);

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
 */
router.get('/chunks', async (req, res) => {
    try {
        const clientId = req.clientId;
        const limit = req.query.limit ? parseInt(req.query.limit) : 100;

        const result = await chunkingService.getAllChunks(clientId, limit);

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
 */
router.get('/chunk-stats', async (req, res) => {
    try {
        const clientId = req.clientId;

        const result = await chunkingService.getChunkStats(clientId);

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
 */
router.delete('/chunks/:url', async (req, res) => {
    try {
        const clientId = req.clientId;
        const url = decodeURIComponent(req.params.url);

        const result = await chunkingService.deleteChunks(clientId, url);

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
