// utils/memoryManager.js

class MemoryManager {
    constructor() {
        this.lastGC = Date.now();
        this.gcInterval = 10; // Standard pages
        this.homepageGcInterval = 5; // Force GC more often for homepage
        this.pageCount = 0;
        this.homepageCount = 0;
    }

    logMemory(label = '') {
        const used = process.memoryUsage();
        const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
        const percentage = Math.round((used.heapUsed / used.heapTotal) * 100);
        
        console.log(`💾 ${label}: ${heapUsedMB}/${heapTotalMB}MB (${percentage}%)`);
        
        // More aggressive threshold for homepage
        const threshold = this.homepageCount > 0 ? 75 : 80;
        
        if (percentage > threshold) {
            console.warn(`⚠️ Memory usage high (${percentage}%)! Forcing GC...`);
            this.forceGC();
        }
    }

    forceGC() {
        if (global.gc) {
            const before = process.memoryUsage().heapUsed;
            global.gc();
            const after = process.memoryUsage().heapUsed;
            const freed = Math.round((before - after) / 1024 / 1024);
            console.log(`🗑️ GC: Freed ${freed}MB`);
            this.lastGC = Date.now();
        }
    }

    async afterPageScrape(isHomepage = false) {
        this.pageCount++;
        
        if (isHomepage) {
            this.homepageCount++;
            // Force GC immediately after homepage
            console.log('🏠 Homepage processed, forcing GC...');
            await this.delay(200);
            this.forceGC();
        } else {
            // Standard interval for regular pages
            if (this.pageCount % this.gcInterval === 0) {
                await this.delay(100);
                this.forceGC();
            }
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    reset() {
        this.pageCount = 0;
        this.homepageCount = 0;
        this.forceGC();
    }
}

export default new MemoryManager();
