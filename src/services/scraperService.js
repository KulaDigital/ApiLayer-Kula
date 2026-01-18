// services/scraperService.js
import axios from 'axios';
import * as cheerio from 'cheerio';
import supabase from '../config/database.js';
import xml2js from 'xml2js';
import { URL } from 'url';
import chunkingService from './chunkingService.js';
import memoryManager from '../utils/memoryManager.js';



class ScraperService {

    constructor() {
        this.maxPagesPerBatch = 50;
        this.maxPagesPerCrawl = 100;
        this.crawlDelay = 1000;
        this.timeout = 15000;

        // STANDARD PAGES
        this.maxPageSize = 5 * 1024 * 1024; // 5MB
        this.maxContentLength = 300000; // 300k chars

        // HOMEPAGE SPECIFIC (stricter)
        this.homepageMaxPageSize = 3 * 1024 * 1024; // 3MB
        this.homepageMaxContentLength = 100000; // 100k chars (1/3 of normal)
        this.homepageMaxWords = 15000; // Max words before chunking

        this.batchSize = 5;
    }

    /**
     * Universal homepage detection
     */
    isHomepage(url) {
        try {
            const urlObj = new URL(url);
            const path = urlObj.pathname;

            // Root paths that indicate homepage
            const homepagePaths = ['/', '/home', '/index', '/index.html', '/index.php', ''];

            // Remove trailing slash for comparison
            const normalizedPath = path.endsWith('/') && path.length > 1
                ? path.slice(0, -1)
                : path;

            return homepagePaths.includes(normalizedPath) || homepagePaths.includes(path);

        } catch (error) {
            return false;
        }
    }

    /**
     * Get page-specific limits based on type
     */
    getPageLimits(url) {
        const isHome = this.isHomepage(url);

        return {
            isHomepage: isHome,
            maxPageSize: isHome ? this.homepageMaxPageSize : this.maxPageSize,
            maxContentLength: isHome ? this.homepageMaxContentLength : this.maxContentLength,
            label: isHome ? '🏠 HOMEPAGE' : '📄 PAGE'
        };
    }

    /**
     * Aggressive content cleaning for homepages
     */
    cleanHomepageContent($) {
        // Remove even more aggressive for homepage
        $(
            // Scripts & styles
            'script, style, noscript, link[rel="stylesheet"]',

            // Navigation & UI elements
            'nav, header, footer, aside, .sidebar, #sidebar',
            'iframe, object, embed, applet',

            // Media
            'img, video, audio, canvas, svg, picture, source',

            // Forms (usually not needed for context)
            'form, input, textarea, select, button',

            // Ads & tracking
            '.advertisement, .ads, #ads, .ad-container',
            '.social-share, .share-buttons',
            '[class*="cookie"], [id*="cookie"]',
            '[class*="popup"], [id*="popup"]',
            '[class*="modal"], [id*="modal"]',

            // Comments
            '.comments, #comments, .comment-section',

            // Maps
            'map, area'
        ).remove();

        return $;
    }

    /**
     * Extract only essential homepage content
     */
    extractHomepageContent($) {
        $ = this.cleanHomepageContent($);

        // Priority selectors for homepage (ordered by importance)
        const prioritySelectors = [
            // Hero/main sections
            '[role="main"]',
            'main',
            '.hero, .hero-section',
            '.main-content, #main-content',

            // About/company info
            '.about, #about',
            '.company-info, .company-description',

            // Services/products (brief overview only)
            '.services, #services',
            '.products, #products',

            // Core content
            'article',
            '.content, #content',

            // Fallback
            'body'
        ];

        let content = '';

        for (const selector of prioritySelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                content = element.text();
                if (content.length > 5000) { // If we got substantial content
                    break;
                }
            }
        }

        // Clean whitespace aggressively
        content = content
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, ' ')
            .replace(/\t+/g, ' ')
            .trim();

        return content;
    }

    /**
     * Extract standard page content (existing logic)
     */
    extractStandardContent($) {
        // Remove standard elements
        $(
            'script, style, nav, footer, header, iframe, noscript, ' +
            'svg, img, video, audio, canvas, map, object, embed, ' +
            'link[rel="stylesheet"], .advertisement, .ads, #ads'
        ).remove();

        let content = '';
        const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', 'body'];

        for (const selector of mainSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                content = element.text();
                break;
            }
        }

        content = content
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim();

        return content;
    }

    async scrapeUrl(url) {
        let response = null;

        try {
            // Get page-specific limits
            const limits = this.getPageLimits(url);

            console.log(`${limits.label} Scraping: ${url}`);

            // Check size with page-specific limits
            const sizeCheck = await this.checkPageSize(url);
            if (!sizeCheck.ok) {
                return {
                    url,
                    pageTitle: 'Skipped',
                    content: '',
                    links: [],
                    success: false,
                    error: `Skipped: ${sizeCheck.reason}`
                };
            }

            // If size exceeds homepage limit, skip
            if (limits.isHomepage && sizeCheck.size && sizeCheck.size > limits.maxPageSize) {
                console.log(`⚠️ Homepage too large (${Math.round(sizeCheck.size / 1024 / 1024)}MB), skipping`);
                return {
                    url,
                    pageTitle: 'Homepage Too Large',
                    content: '',
                    links: [],
                    success: false,
                    error: 'Homepage exceeds 3MB limit'
                };
            }

            response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; GreetoBot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Encoding': 'gzip, deflate'
                },
                maxContentLength: limits.maxPageSize,
                maxBodyLength: limits.maxPageSize,
                decompress: true
            });

            if (!response || !response.data) {
                throw new Error('Empty response');
            }

            // Load HTML
            const $ = cheerio.load(response.data, {
                normalizeWhitespace: true,
                decodeEntities: true,
                xmlMode: false
            });

            const pageTitle = $('title').text().trim() || 'Untitled';

            // Extract content based on page type
            let content;
            if (limits.isHomepage) {
                content = this.extractHomepageContent($);
                console.log(`🏠 Extracted ${content.length} chars from homepage`);
            } else {
                content = this.extractStandardContent($);
            }

            // Apply content length limits
            content = content.substring(0, limits.maxContentLength);

            // Add meta description
            const metaDescription = $('meta[name="description"]').attr('content') || '';
            const fullContent = `${pageTitle}\n\n${metaDescription}\n\n${content}`;

            // Extract links
            const links = this.extractLinks(response.data, url);

            // Clear memory
            response.data = null;
            response = null;

            return {
                url,
                pageTitle,
                content: fullContent,
                links,
                success: true,
                isHomepage: limits.isHomepage
            };

        } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);

            if (error.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' ||
                error.code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED') {
                return {
                    url,
                    pageTitle: 'Page Too Large',
                    content: '',
                    links: [],
                    success: false,
                    error: 'Page size exceeds limit'
                };
            }

            return {
                url,
                pageTitle: 'Error',
                content: '',
                links: [],
                success: false,
                error: error.message
            };
        } finally {
            if (response) {
                response.data = null;
                response = null;
            }
        }
    }

    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            urlObj.hash = '';
            let normalized = urlObj.href;
            if (normalized.endsWith('/')) {
                normalized = normalized.slice(0, -1);
            }
            return normalized;
        } catch (error) {
            return url;
        }
    }

    getDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            return null;
        }
    }

    async checkPageSize(url) {
        try {
            const response = await axios.head(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; GreetoBot/1.0)'
                },
                maxRedirects: 5
            });

            const contentLength = parseInt(response.headers['content-length'] || '0');
            const contentType = response.headers['content-type'] || '';

            if (contentLength > this.maxPageSize) {
                console.log(`⚠️ Skipping large page: ${url} (${Math.round(contentLength / 1024 / 1024)}MB)`);
                return { ok: false, reason: 'too_large', size: contentLength };
            }

            if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
                console.log(`⚠️ Skipping non-HTML: ${url} (${contentType})`);
                return { ok: false, reason: 'not_html' };
            }

            return { ok: true, size: contentLength };

        } catch (error) {
            return { ok: true };
        }
    }

    extractLinks(html, baseUrl) {
        try {
            const $ = cheerio.load(html, {
                normalizeWhitespace: true,
                decodeEntities: false
            });

            const links = new Set();
            const baseDomain = this.getDomain(baseUrl);

            $('a[href]').each((_, element) => {
                try {
                    const href = $(element).attr('href');
                    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                        return;
                    }

                    const absoluteUrl = new URL(href, baseUrl).href;
                    const domain = this.getDomain(absoluteUrl);

                    if (domain === baseDomain) {
                        const normalized = this.normalizeUrl(absoluteUrl);
                        if (!normalized.match(/\.(pdf|jpg|jpeg|png|gif|zip|css|js|xml|ico|woff|woff2|ttf|eot|svg)(\?.*)?$/i)) {
                            links.add(normalized);
                        }
                    }
                } catch (error) {
                    // Skip invalid URLs
                }
            });

            return Array.from(links);
        } catch (error) {
            console.error('Error extracting links:', error.message);
            return [];
        }
    }

    async fetchSitemap(baseUrl, visitedSitemaps = new Set()) {
        try {
            const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;

            if (visitedSitemaps.has(sitemapUrl)) {
                return [];
            }

            visitedSitemaps.add(sitemapUrl);
            console.log(`Checking sitemap: ${sitemapUrl}`);

            const response = await axios.get(sitemapUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; GreetoBot/1.0)'
                },
                maxRedirects: 5,
                maxContentLength: 10 * 1024 * 1024
            });

            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(response.data);

            const urls = [];

            if (result.sitemapindex) {
                const sitemaps = result.sitemapindex.sitemap || [];
                console.log(`📑 Found sitemap index with ${sitemaps.length} sub-sitemaps`);

                for (const sitemap of sitemaps) {
                    const sitemapLoc = sitemap.loc[0];

                    if (visitedSitemaps.has(sitemapLoc)) {
                        continue;
                    }

                    const subUrls = await this.fetchSitemap(sitemapLoc, visitedSitemaps);
                    urls.push(...subUrls);

                    if (visitedSitemaps.size > 50) {
                        console.log('⚠️ Reached sitemap limit (50), stopping');
                        break;
                    }
                }
            } else if (result.urlset) {
                const urlEntries = result.urlset.url || [];
                console.log(`📄 Found ${urlEntries.length} URLs in sitemap`);

                for (const entry of urlEntries) {
                    if (entry.loc && entry.loc[0]) {
                        urls.push(entry.loc[0]);
                    }
                }
            }

            return urls;

        } catch (error) {
            console.log(`❌ Sitemap error: ${error.message}`);
            return [];
        }
    }

    async storeContent(clientId, url, pageTitle, content) {
        try {
            console.log(`📦 Creating chunks for: ${url}`);

            const result = await chunkingService.processContent(
                clientId,
                url,
                pageTitle,
                content
            );

            if (result.success) {
                console.log(`✅ Created ${result.count} chunks for ${url}`);
            } else {
                console.log(`⚠️ Chunking failed: ${result.reason || result.error}`);
            }

            return result;

        } catch (error) {
            console.error(`Error storing ${url}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async scrapeBatch(clientId, urls) {
        if (urls.length > this.maxPagesPerBatch) {
            throw new Error(`Too many URLs. Maximum ${this.maxPagesPerBatch} per batch.`);
        }

        console.log(`\n🔄 Batch scraping ${urls.length} URLs...`);
        memoryManager.reset();

        const results = [];

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const scraped = await this.scrapeUrl(url);

            let result;
            if (scraped.success) {
                const stored = await this.storeContent(
                    clientId,
                    scraped.url,
                    scraped.pageTitle,
                    scraped.content
                );
                result = {
                    url: scraped.url,
                    success: stored.success,
                    pageTitle: scraped.pageTitle,
                    contentLength: scraped.content.length,
                    chunksCreated: stored.count || 0,
                    isHomepage: scraped.isHomepage || false
                };
            } else {
                result = {
                    url,
                    success: false,
                    error: scraped.error,
                    isHomepage: scraped.isHomepage || false
                };
            }

            results.push(result);
            console.log(`Progress: ${i + 1}/${urls.length}`);

            // Pass homepage info to memory manager
            await memoryManager.afterPageScrape(scraped.isHomepage || false);

            if (i < urls.length - 1) {
                await memoryManager.delay(this.crawlDelay);
            }
        }

        const successCount = results.filter(r => r.success).length;
        const homepageCount = results.filter(r => r.isHomepage).length;

        console.log(`✅ Batch complete: ${successCount}/${urls.length} successful (${homepageCount} homepages)`);

        memoryManager.forceGC();

        return {
            totalUrls: urls.length,
            successCount,
            failedCount: urls.length - successCount,
            homepageCount,
            results
        };
    }


    async crawlDomain(clientId, websiteUrl) {
        const { data: job, error: jobError } = await supabase
            .from('scraping_jobs')
            .insert({
                client_id: clientId,
                website_url: websiteUrl,
                status: 'pending'
            })
            .select()
            .single();

        if (jobError) {
            throw new Error('Failed to create scraping job');
        }

        this.executeCrawl(job.id, clientId, websiteUrl).catch(error => {
            console.error('Crawl execution error:', error);
        });

        return {
            jobId: job.id,
            status: 'started',
            message: 'Crawling started. Use GET /api/scraper/job/:jobId to check progress.'
        };
    }

    async executeCrawl(jobId, clientId, websiteUrl) {
        try {
            await supabase
                .from('scraping_jobs')
                .update({
                    status: 'running',
                    started_at: new Date().toISOString()
                })
                .eq('id', jobId);

            console.log(`\n🚀 Starting domain crawl for: ${websiteUrl}`);
            memoryManager.reset();
            memoryManager.logMemory('Start');

            let allUrls = [];

            const visitedSitemaps = new Set();
            const sitemapUrls = await this.fetchSitemap(websiteUrl, visitedSitemaps);

            if (sitemapUrls.length > 0) {
                allUrls = sitemapUrls.slice(0, this.maxPagesPerCrawl);
                console.log(`✅ Using ${allUrls.length} URLs from sitemap`);
            } else {
                console.log('⚠️ No sitemap found, starting manual crawl...');
                allUrls = await this.discoverUrls(websiteUrl, this.maxPagesPerCrawl);
            }

            await supabase
                .from('scraping_jobs')
                .update({ total_urls: allUrls.length })
                .eq('id', jobId);

            console.log(`\n📄 Crawling ${allUrls.length} pages...`);

            let scrapedCount = 0;
            let failedCount = 0;
            let chunksCreated = 0;

            // CRITICAL: Process in small batches with GC between batches
            for (let i = 0; i < allUrls.length; i += this.batchSize) {
                const batch = allUrls.slice(i, i + this.batchSize);

                console.log(`\n🔄 Batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(allUrls.length / this.batchSize)}`);
                memoryManager.logMemory('Before batch');

                for (const url of batch) {
                    const scraped = await this.scrapeUrl(url);

                    if (scraped.success) {
                        const stored = await this.storeContent(
                            clientId,
                            scraped.url,
                            scraped.pageTitle,
                            scraped.content
                        );
                        if (stored.success) {
                            scrapedCount++;
                            chunksCreated += stored.count || 0;
                        } else {
                            failedCount++;
                        }
                    } else {
                        failedCount++;
                    }

                    await memoryManager.afterPageScrape();
                    await memoryManager.delay(this.crawlDelay);
                }

                // Update DB after each batch
                await supabase
                    .from('scraping_jobs')
                    .update({
                        scraped_count: scrapedCount,
                        failed_count: failedCount,
                        chunks_created: chunksCreated
                    })
                    .eq('id', jobId);

                console.log(`Progress: ${scrapedCount + failedCount}/${allUrls.length}`);

                // Force GC after each batch
                memoryManager.forceGC();
                memoryManager.logMemory('After batch');

                // Longer pause between batches
                await memoryManager.delay(2000);
            }

            await supabase
                .from('scraping_jobs')
                .update({
                    status: 'completed',
                    scraped_count: scrapedCount,
                    failed_count: failedCount,
                    chunks_created: chunksCreated,
                    completed_at: new Date().toISOString()
                })
                .eq('id', jobId);

            console.log(`\n✅ Crawl complete: ${scrapedCount}/${allUrls.length} successful, ${chunksCreated} chunks created`);
            memoryManager.logMemory('End');

        } catch (error) {
            console.error('Crawl error:', error);

            await supabase
                .from('scraping_jobs')
                .update({
                    status: 'failed',
                    error_message: error.message,
                    completed_at: new Date().toISOString()
                })
                .eq('id', jobId);
        }
    }

    async discoverUrls(startUrl, maxPages) {
        const visited = new Set();
        const queue = [this.normalizeUrl(startUrl)];
        const discovered = [];

        memoryManager.reset();

        while (queue.length > 0 && discovered.length < maxPages) {
            const url = queue.shift();

            if (visited.has(url)) continue;
            visited.add(url);
            discovered.push(url);

            const scraped = await this.scrapeUrl(url);
            if (scraped.success) {
                for (const link of scraped.links) {
                    if (!visited.has(link) && discovered.length < maxPages) {
                        queue.push(link);
                    }
                }
            }

            await memoryManager.afterPageScrape();
            await memoryManager.delay(this.crawlDelay);

            if (discovered.length % 10 === 0) {
                memoryManager.logMemory(`Discovered ${discovered.length}`);
            }
        }

        return discovered;
    }

    async getJobStatus(jobId) {
        const { data, error } = await supabase
            .from('scraping_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (error) throw error;
        return data;
    }

    async getClientContent(clientId) {
        const result = await chunkingService.getScrapedUrls(clientId);

        if (result.success) {
            return result.urls;
        }

        throw new Error(result.error || 'Failed to get content');
    }
}

export default new ScraperService();
