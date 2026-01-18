import supabase from "../config/database.js";

export const vectorSearchService = {
    /**
     * Search for similar chunks using vector similarity
     */
    async searchSimilarChunks(embedding, clientId, options = {}) {
        try {
            const { matchThreshold = 0.5, matchCount = 5 } = options;

            console.log(`🔍 Searching for similar chunks (client: ${clientId})`);

            const { data, error } = await supabase
                .rpc('search_similar_chunks', {
                    match_client_id: clientId,
                    query_embedding: embedding,
                    match_threshold: matchThreshold,
                    match_count: matchCount
                });

            if (error) {
                console.error('❌ Vector search error:', error);
                return { success: false, error: error.message };
            }

            console.log(`✅ Found ${data?.length || 0} similar chunks`);

            // ✅ Map the results to ensure consistent field names
            const results = data.map(result => ({
                id: result.id,
                url: result.url,
                page_title: result.page_title,
                text: result.chunk_text,
                similarity: result.similarity
            }));

            return {
                success: true,
                results: results
            };
        } catch (error) {
            console.error('❌ Error in vector search:', error);
            return { success: false, error: error.message };
        }
    },
    /**
     * Get vector search statistics
     */
    async getStats(clientId) {
        try {
            // Count chunks with embeddings
            const { count: totalWithEmbeddings, error: countError } = await supabase
                .from('content_chunks')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', clientId)
                .not('embedding', 'is', null);

            if (countError) throw countError;

            // Count total chunks
            const { count: totalChunks, error: totalError } = await supabase
                .from('content_chunks')
                .select('*', { count: 'exact', head: true })
                .eq('client_id', clientId);

            if (totalError) throw totalError;

            return {
                success: true,
                stats: {
                    totalChunks,
                    withEmbeddings: totalWithEmbeddings,
                    percentComplete: totalChunks > 0
                        ? Math.round((totalWithEmbeddings / totalChunks) * 100)
                        : 0
                }
            };

        } catch (error) {
            console.error('❌ Error getting stats:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};
