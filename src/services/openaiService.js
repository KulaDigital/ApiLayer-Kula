import OpenAI from 'openai';
import dotenv from 'dotenv';
import supabase from '../config/database.js';

dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ==========================================
// EXISTING: Chat Completion
// ==========================================

/**
 * Get chat response from OpenAI
 */
export async function getChatResponse(userMessage, context = '') {
    try {
        // Construct system message with optional context
        const systemMessage = context
            ? `You are a helpful assistant for Greeto. Use this context to answer questions: ${context}`
            : 'You are a helpful assistant for Greeto.';

        console.log('System Message:', systemMessage);
        console.log('User Message:', userMessage);

        // Create chat completion 
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 20,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw new Error('Failed to get response from AI');
    }
}

// ==========================================
// NEW: Embedding Generation
// ==========================================

class EmbeddingService {
    constructor() {
        // Using text-embedding-3-small (cheaper, faster, good quality)
        this.embeddingModel = 'text-embedding-3-small';
        this.embeddingDimensions = 1536;

        // Rate limiting (OpenAI: 3,000 RPM for tier 1)
        this.maxRequestsPerMinute = 500; // Conservative limit
        this.requestDelay = Math.ceil(60000 / this.maxRequestsPerMinute); // ~120ms

        // Batch processing
        this.batchSize = 100; // Process 100 chunks at a time

        // Token limits
        this.maxTokensPerRequest = 8191; // API limit
        this.estimatedCharsPerToken = 4; // Rough estimate
    }

    /**
     * Generate embedding for a single text
     */
    async generateEmbedding(text) {
        try {
            if (!text || text.trim().length === 0) {
                throw new Error('Text cannot be empty');
            }

            // Truncate if too long (OpenAI limit: 8191 tokens)
            const maxChars = this.maxTokensPerRequest * this.estimatedCharsPerToken;
            if (text.length > maxChars) {
                console.warn(`⚠️ Text too long (${text.length} chars), truncating to ${maxChars}`);
                text = text.substring(0, maxChars);
            }

            const response = await openai.embeddings.create({
                model: this.embeddingModel,
                input: text,
                encoding_format: 'float'
            });

            if (!response.data || response.data.length === 0) {
                throw new Error('No embedding returned from API');
            }

            return {
                success: true,
                embedding: response.data[0].embedding,
                tokens: response.usage.total_tokens,
                model: this.embeddingModel
            };

        } catch (error) {
            console.error('Error generating embedding:', error.message);

            // Handle rate limits
            if (error.status === 429) {
                console.warn('⚠️ Rate limit hit, need to slow down');
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate embeddings for multiple texts (batch)
     */
    async generateEmbeddings(texts) {
        try {
            if (!Array.isArray(texts) || texts.length === 0) {
                throw new Error('Texts must be a non-empty array');
            }

            // Filter out empty texts
            const validTexts = texts.filter(t => t && t.trim().length > 0);

            if (validTexts.length === 0) {
                throw new Error('No valid texts to process');
            }

            // Truncate long texts
            const processedTexts = validTexts.map(text => {
                const maxChars = this.maxTokensPerRequest * this.estimatedCharsPerToken;
                return text.length > maxChars ? text.substring(0, maxChars) : text;
            });

            const response = await openai.embeddings.create({
                model: this.embeddingModel,
                input: processedTexts,
                encoding_format: 'float'
            });

            if (!response.data || response.data.length === 0) {
                throw new Error('No embeddings returned from API');
            }

            return {
                success: true,
                embeddings: response.data.map(d => d.embedding),
                tokens: response.usage.total_tokens,
                model: this.embeddingModel,
                count: response.data.length
            };

        } catch (error) {
            console.error('Error generating embeddings:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Store embedding in database
     */
    async storeEmbedding(chunkId, embedding, tokens) {
        try {
            // ✅ Store as array, NOT as JSON string (pgvector requirement)
            const { error } = await supabase
                .from('content_chunks')
                .update({
                    embedding: embedding,  // ← Changed from JSON.stringify(embedding)
                    embedding_model: this.embeddingModel,
                    embedding_token_count: tokens,
                    embedding_generated_at: new Date().toISOString()
                })
                .eq('id', chunkId);

            if (error) {
                console.error(`❌ Error storing embedding for chunk ${chunkId}:`, error);
                throw error;
            }

            return { success: true };

        } catch (error) {
            console.error(`❌ Error storing embedding for chunk ${chunkId}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Generate and store embedding for a single chunk
     */
    async processChunk(chunkId, chunkText) {
        try {
            console.log(`🔄 Processing chunk ${chunkId}...`);

            // Generate embedding
            const embeddingResult = await this.generateEmbedding(chunkText);

            if (!embeddingResult.success) {
                return {
                    success: false,
                    chunkId,
                    error: embeddingResult.error
                };
            }

            // Store in database
            const storeResult = await this.storeEmbedding(
                chunkId,
                embeddingResult.embedding,
                embeddingResult.tokens
            );

            if (!storeResult.success) {
                return {
                    success: false,
                    chunkId,
                    error: storeResult.error
                };
            }

            return {
                success: true,
                chunkId,
                tokens: embeddingResult.tokens
            };

        } catch (error) {
            console.error(`Error processing chunk ${chunkId}:`, error);
            return {
                success: false,
                chunkId,
                error: error.message
            };
        }
    }

    /**
     * Batch process chunks with rate limiting
     */

    async processChunksBatch(chunks) {
        let successCount = 0;
        let failedCount = 0;
        let totalTokens = 0;

        for (const chunk of chunks) {
            try {
                // Generate embedding
                const embeddingResult = await this.generateEmbedding(chunk.chunk_text);

                if (!embeddingResult.success) {
                    console.error(`❌ Failed to generate embedding for chunk ${chunk.id}`);
                    failedCount++;
                    continue;
                }

                // Update chunk with vector embedding
                const { error: updateError } = await supabase
                    .from('content_chunks')
                    .update({
                        embedding: embeddingResult.embedding,  // ← Vector type
                        embedding_model: embeddingResult.model,
                        embedding_token_count: embeddingResult.tokens,
                        embedding_generated_at: new Date().toISOString()
                    })
                    .eq('id', chunk.id);

                if (updateError) {
                    console.error(`❌ Failed to update chunk ${chunk.id}:`, updateError);
                    failedCount++;
                    continue;
                }

                successCount++;
                totalTokens += embeddingResult.tokens;

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 20));

            } catch (error) {
                console.error(`❌ Error processing chunk ${chunk.id}:`, error);
                failedCount++;
            }
        }

        return {
            success: true,
            successCount,
            failedCount,
            totalTokens,
            estimatedCost: this.estimateCost(totalTokens)
        };
    }


    /**
     * Process ALL chunks for a client (with memory management)
     */
    async processAllChunks(clientId) {
        try {
            console.log(`\n🚀 Starting embedding generation for client ${clientId}...`);

            // Get all chunks without embeddings
            const { data: chunks, error } = await supabase
                .from('content_chunks')
                .select('id, chunk_text, chunk_index, url')
                .eq('client_id', clientId)
                .is('embedding', null)
                .order('url', { ascending: true })
                .order('chunk_index', { ascending: true });

            if (error) throw error;

            if (!chunks || chunks.length === 0) {
                console.log('✅ No chunks need embeddings');
                return {
                    success: true,
                    message: 'All chunks already have embeddings',
                    totalChunks: 0
                };
            }

            console.log(`📊 Found ${chunks.length} chunks needing embeddings`);

            // Process in batches
            const batches = [];
            for (let i = 0; i < chunks.length; i += this.batchSize) {
                batches.push(chunks.slice(i, i + this.batchSize));
            }

            console.log(`📦 Processing ${batches.length} batches of ${this.batchSize} chunks each`);

            let totalSuccessCount = 0;
            let totalFailedCount = 0;
            let totalTokens = 0;

            for (let i = 0; i < batches.length; i++) {
                console.log(`\n--- Batch ${i + 1}/${batches.length} ---`);

                const batchResult = await this.processChunksBatch(batches[i]);

                totalSuccessCount += batchResult.successCount;
                totalFailedCount += batchResult.failedCount;
                totalTokens += batchResult.totalTokens;

                // Memory cleanup between batches
                if (global.gc && i < batches.length - 1) {
                    global.gc();
                    await this.delay(1000); // 1 second pause between batches
                }
            }

            const estimatedCost = this.estimateCost(totalTokens);

            console.log(`\n✅ ALL BATCHES COMPLETE!`);
            console.log(`📊 Total: ${totalSuccessCount}/${chunks.length} successful`);
            console.log(`🪙 Tokens used: ${totalTokens.toLocaleString()}`);
            console.log(`💰 Estimated cost: $${estimatedCost.toFixed(4)}`);

            return {
                success: true,
                totalChunks: chunks.length,
                successCount: totalSuccessCount,
                failedCount: totalFailedCount,
                totalTokens,
                estimatedCost,
                batches: batches.length
            };

        } catch (error) {
            console.error('Error processing all chunks:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==========================================
    // Embedding Jobs (async, like scraping_jobs)
    // ==========================================

    /**
     * Start an async embedding job — creates a row in embedding_jobs,
     * kicks off background processing, and returns the jobId immediately.
     */
    async startEmbeddingJob(clientId) {
        // Check pending chunks first
        const pendingResult = await this.getPendingChunksCount(clientId);

        if (!pendingResult.success) {
            throw new Error('Failed to check pending chunks: ' + pendingResult.error);
        }

        if (pendingResult.count === 0) {
            return {
                success: true,
                alreadyComplete: true,
                message: 'All chunks already have embeddings',
                pendingCount: 0
            };
        }

        // Create job row
        const { data: job, error: jobError } = await supabase
            .from('embedding_jobs')
            .insert({
                client_id: clientId,
                status: 'pending',
                total_chunks: pendingResult.count,
                embedding_model: this.embeddingModel
            })
            .select()
            .single();

        if (jobError) {
            console.error('Embedding job creation error:', jobError);
            throw new Error('Failed to create embedding job');
        }

        // Fire-and-forget background execution
        this.executeEmbeddingJob(job.id, clientId).catch(error => {
            console.error('Embedding job execution error:', error);
        });

        return {
            success: true,
            alreadyComplete: false,
            jobId: job.id,
            status: 'pending',
            totalChunks: pendingResult.count,
            message: 'Embedding generation started. Use GET /api/embeddings/job/' + job.id + ' to check progress.'
        };
    }

    /**
     * Background worker — processes all pending chunks for a client,
     * updating the embedding_jobs row with progress after each batch.
     * Mirrors the pattern of scraperService.executeCrawl().
     */
    async executeEmbeddingJob(jobId, clientId) {
        try {
            // Mark as running
            await supabase
                .from('embedding_jobs')
                .update({
                    status: 'running',
                    started_at: new Date().toISOString()
                })
                .eq('id', jobId);

            console.log(`\n🚀 Embedding job ${jobId} running for client ${clientId}...`);

            // Get all chunks without embeddings
            const { data: chunks, error } = await supabase
                .from('content_chunks')
                .select('id, chunk_text, chunk_index, url')
                .eq('client_id', clientId)
                .is('embedding', null)
                .order('url', { ascending: true })
                .order('chunk_index', { ascending: true });

            if (error) throw error;

            if (!chunks || chunks.length === 0) {
                await supabase
                    .from('embedding_jobs')
                    .update({
                        status: 'completed',
                        total_chunks: 0,
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', jobId);
                return;
            }

            // Update total_chunks with actual count
            await supabase
                .from('embedding_jobs')
                .update({ total_chunks: chunks.length })
                .eq('id', jobId);

            // Split into batches
            const batches = [];
            for (let i = 0; i < chunks.length; i += this.batchSize) {
                batches.push(chunks.slice(i, i + this.batchSize));
            }

            console.log(`📦 Embedding job ${jobId}: ${batches.length} batches of up to ${this.batchSize} chunks`);

            let totalSuccessCount = 0;
            let totalFailedCount = 0;
            let totalSkippedCount = 0;
            let totalTokens = 0;

            for (let i = 0; i < batches.length; i++) {
                console.log(`\n--- Embedding job ${jobId} — Batch ${i + 1}/${batches.length} ---`);

                const batchResult = await this.processChunksBatch(batches[i]);

                totalSuccessCount += batchResult.successCount;
                totalFailedCount += batchResult.failedCount;
                totalTokens += batchResult.totalTokens;

                // Update progress in DB after each batch
                await supabase
                    .from('embedding_jobs')
                    .update({
                        processed_count: totalSuccessCount,
                        failed_count: totalFailedCount,
                        skipped_count: totalSkippedCount,
                        total_tokens: totalTokens,
                        estimated_cost: this.estimateCost(totalTokens)
                    })
                    .eq('id', jobId);

                // Memory cleanup between batches
                if (global.gc && i < batches.length - 1) {
                    global.gc();
                    await this.delay(1000);
                }
            }

            const estimatedCost = this.estimateCost(totalTokens);

            // Mark completed
            await supabase
                .from('embedding_jobs')
                .update({
                    status: 'completed',
                    processed_count: totalSuccessCount,
                    failed_count: totalFailedCount,
                    skipped_count: totalSkippedCount,
                    total_tokens: totalTokens,
                    estimated_cost: estimatedCost,
                    completed_at: new Date().toISOString()
                })
                .eq('id', jobId);

            console.log(`\n✅ Embedding job ${jobId} completed: ${totalSuccessCount}/${chunks.length} successful`);
            console.log(`🪙 Tokens used: ${totalTokens.toLocaleString()}`);
            console.log(`💰 Estimated cost: $${estimatedCost.toFixed(4)}`);

        } catch (error) {
            console.error(`Embedding job ${jobId} error:`, error);

            await supabase
                .from('embedding_jobs')
                .update({
                    status: 'failed',
                    error_message: error.message,
                    last_error_at: new Date().toISOString(),
                    completed_at: new Date().toISOString()
                })
                .eq('id', jobId);
        }
    }

    /**
     * Get embedding job status by jobId
     */
    async getEmbeddingJobStatus(jobId) {
        const { data, error } = await supabase
            .from('embedding_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get chunks without embeddings count
     */
    async getPendingChunksCount(clientId) {
        try {
            const { count, error } = await supabase
                .from('content_chunks')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', clientId)
                .is('embedding', null);

            if (error) {
                console.error('❌ Supabase error in getPendingChunksCount:', error);
                throw error;
            }

            console.log(`✅ Found ${count || 0} pending chunks`);
            return { success: true, count: count || 0 };

        } catch (error) {
            console.error('❌ Error getting pending chunks count:', error);
            return { success: false, error: error.message };
        }
    }


    /**
     * Estimate OpenAI cost
     */
    estimateCost(tokens) {
        // text-embedding-3-small pricing: $0.02 per 1M tokens
        const pricePerMillionTokens = 0.02;
        return (tokens / 1000000) * pricePerMillionTokens;
    }

    /**
     * Delay utility
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test embedding generation
     */
    async testEmbedding(text = "This is a test sentence for embedding generation.") {
        try {
            console.log('\n🧪 Testing embedding generation...');
            console.log(`Input: "${text}"`);

            const result = await this.generateEmbedding(text);

            if (result.success) {
                console.log(`✅ Success!`);
                console.log(`📊 Model: ${result.model}`);
                console.log(`📏 Dimensions: ${result.embedding.length}`);
                console.log(`🪙 Tokens: ${result.tokens}`);
                console.log(`💰 Cost: $${this.estimateCost(result.tokens).toFixed(6)}`);
                console.log(`🔢 First 5 values: [${result.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
            } else {
                console.log(`❌ Failed: ${result.error}`);
            }

            return result;

        } catch (error) {
            console.error('Test failed:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export embedding service instance
export const embeddingService = new EmbeddingService();

// Also export as default for backward compatibility
export default {
    getChatResponse,
    embeddingService
};
