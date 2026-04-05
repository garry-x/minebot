const fs = require('fs');
const path = require('path');

class ExperienceLogger {
  constructor(storage) {
    this.storage = storage;
    this.buffer = [];
    this.flushTimer = null;
    this.bufferSize = 0;
    this.lastFlushTime = Date.now();
    this.config = {
      maxBufferSize: 10,
      flushInterval: 30000
    };
    this.walPath = path.resolve(__dirname, 'wal.json');
    this.isFlushing = false;
  }

  async record(experience) {
    this.buffer.push(experience);
    this.bufferSize++;

    if (this.bufferSize >= this.config.maxBufferSize) {
      await this.flush();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, this.config.flushInterval);
    }
  }

  async flush() {
    if (this.buffer.length === 0 || this.isFlushing) {
      return;
    }

    this.isFlushing = true;

    try {
      await this._flushToDatabase();
      this.lastFlushTime = Date.now();
      this.buffer = [];
      this.bufferSize = 0;
    } catch (err) {
      console.error(`[ExperienceLogger] Failed to flush to database: ${err.message}`);
      await this._persistToWAL();
    } finally {
      this.isFlushing = false;
    }
  }

  async _flushToDatabase() {
    if (this.buffer.length === 0) {
      return { success: true, count: 0 };
    }

    const experiences = this.buffer.map(exp => ({
      bot_id: exp.bot_id,
      type: exp.type,
      context: exp.context,
      action: exp.action,
      outcome: exp.outcome,
      success: exp.outcome.success,
      fitness_score: exp.fitness_score
    }));

    return await this.storage.saveExperienceBatch(experiences);
  }

  async _persistToWAL() {
    try {
      let walData = [];
      if (fs.existsSync(this.walPath)) {
        const existingData = fs.readFileSync(this.walPath, 'utf8');
        if (existingData.trim()) {
          walData = JSON.parse(existingData);
        }
      }

      const botId = this.buffer[0]?.bot_id || 'unknown';
      const domain = this.buffer[0]?.type || 'unknown';

      walData.push({
        botId,
        domain,
        experiences: [...this.buffer],
        timestamp: new Date().toISOString()
      });

      fs.writeFileSync(this.walPath, JSON.stringify(walData, null, 2));
      console.log(`[ExperienceLogger] Persisted ${this.buffer.length} records to WAL file`);
      
      this.buffer = [];
      this.bufferSize = 0;
    } catch (err) {
      console.error(`[ExperienceLogger] Failed to persist to WAL: ${err.message}`);
    }
  }

  async query(botId, type, limit = 100) {
    try {
      return await this.storage.queryExperience(botId, type, limit);
    } catch (err) {
      console.error(`[ExperienceLogger] Query failed: ${err.message}`);
      return [];
    }
  }

  async loadFromWAL() {
    if (!fs.existsSync(this.walPath)) {
      return [];
    }

    try {
      const data = fs.readFileSync(this.walPath, 'utf8');
      if (!data.trim()) {
        return [];
      }

      const walData = JSON.parse(data);
      const experiences = [];

      for (const entry of walData) {
        experiences.push(...entry.experiences);
      }

      fs.unlinkSync(this.walPath);
      console.log(`[ExperienceLogger] Loaded ${experiences.length} records from WAL`);
      return experiences;
    } catch (err) {
      console.error(`[ExperienceLogger] Failed to load from WAL: ${err.message}`);
      return [];
    }
  }

  async flushWAL() {
    const experiences = await this.loadFromWAL();
    if (experiences.length === 0) {
      return { success: true, count: 0 };
    }

    try {
      const result = await this.storage.saveExperienceBatch(experiences);
      return result;
    } catch (err) {
      console.error(`[ExperienceLogger] Failed to flush WAL to DB: ${err.message}`);
      await this._persistToWAL();
      return { success: false, count: 0, error: err.message };
    }
  }

  getBufferStats() {
    return {
      bufferSize: this.bufferSize,
      bufferLength: this.buffer.length,
      timeSinceLastFlush: Date.now() - this.lastFlushTime,
      isFlushing: this.isFlushing
    };
  }
}

module.exports = ExperienceLogger;
