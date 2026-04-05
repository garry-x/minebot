const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class EvolutionStorage {
  constructor(dbPath) {
    this.dbPath = dbPath || path.resolve(__dirname, '../evolution.db');
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(new Error(`Failed to connect to evolution database: ${err.message}`));
          return;
        }
        this.db.run('PRAGMA busy_timeout = 5000', (err) => {
          if (err) {
            reject(new Error(`Failed to set busy timeout: ${err.message}`));
            return;
          }
          resolve();
        });
      });
    });
  }

  async initialize() {
    await this._createTables();
    await this._runMigrations();
  }

  async _createTables() {
    const createEvolutionWeightsTable = `
      CREATE TABLE IF NOT EXISTS evolution_weights (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        weight_vector TEXT NOT NULL CHECK(json_valid(weight_vector)),
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bot_id, domain)
      )
    `;

    const createExperienceLogTable = `
      CREATE TABLE IF NOT EXISTS experience_log (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL,
        type TEXT NOT NULL,
        context TEXT NOT NULL CHECK(json_valid(context)),
        action TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(json_valid(outcome)),
        success INTEGER NOT NULL,
        fitness_score REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
      )
    `;

    const createEvolutionSnapshotsTable = `
      CREATE TABLE IF NOT EXISTS evolution_snapshots (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL,
        snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('weight_update', 'milestone', 'goal_complete', 'pre_rollback', 'performance_degradation')),
        data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
      )
    `;

    const createEvolutionMigrationsTable = `
      CREATE TABLE IF NOT EXISTS evolution_migrations (
        id INTEGER PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        description TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this._runQuery(createEvolutionWeightsTable);
    await this._runQuery(createExperienceLogTable);
    await this._runQuery(createEvolutionSnapshotsTable);
    await this._runQuery(createEvolutionMigrationsTable);
    
    await this._runQuery(`CREATE INDEX IF NOT EXISTS idx_weights_bot_domain ON evolution_weights(bot_id, domain)`);
    await this._runQuery(`CREATE INDEX IF NOT EXISTS idx_exp_bot_type ON experience_log(bot_id, type)`);
    await this._runQuery(`CREATE INDEX IF NOT EXISTS idx_exp_success ON experience_log(id, bot_id, success)`);
  }

  async _runMigrations() {
    const migrations = [
      {
        version: 1,
        description: 'Initial evolution tables',
        up: async () => {
          await this._runQuery(`
            CREATE TABLE IF NOT EXISTS evolution_migrations (
              id INTEGER PRIMARY KEY,
              version INTEGER NOT NULL UNIQUE,
              description TEXT NOT NULL,
              applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
        }
      }
    ];

    const existingMigrations = await this._getAll(`
      SELECT version FROM evolution_migrations
    `);

    const appliedVersions = new Set(existingMigrations.map(r => r.version));

    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        console.log(`[Evolution] Running migration v${migration.version}: ${migration.description}`);
        await migration.up();
        await this._runQuery(
          `INSERT INTO evolution_migrations (version, description) VALUES (?, ?)`,
          [migration.version, migration.description]
        );
      }
    }
  }

  async saveWeights(botId, domain, weightVector) {
    const query = `
      INSERT OR REPLACE INTO evolution_weights (bot_id, domain, weight_vector, version, updated_at)
      VALUES (?, ?, ?, COALESCE((SELECT COALESCE(MAX(version), 0) + 1 FROM evolution_weights WHERE bot_id = ? AND domain = ?), 1), CURRENT_TIMESTAMP)
    `;

    try {
      await this._runQuery(query, [botId, domain, JSON.stringify(weightVector), botId, domain]);
      const loaded = await this.loadWeights(botId, domain);
      return { success: true, version: loaded.version };
    } catch (err) {
      throw new Error(`Failed to save weights: ${err.message}`);
    }
  }

  async loadWeights(botId, domain) {
    const query = `
      SELECT weight_vector, version, created_at, updated_at
      FROM evolution_weights
      WHERE bot_id = ? AND domain = ?
    `;

    const result = await this._getOne(query, [botId, domain]);

    if (!result) {
      return null;
    }

    try {
      return {
        weight_vector: JSON.parse(result.weight_vector),
        version: result.version,
        created_at: result.created_at,
        updated_at: result.updated_at
      };
    } catch (err) {
      throw new Error(`Failed to parse weight vector: ${err.message}`);
    }
  }

  async saveExperience(experience) {
    return this._saveExperienceBatch([experience]);
  }

  async saveExperienceBatch(experiences) {
    return this._saveExperienceBatch(experiences);
  }

  async _saveExperienceBatch(experiences) {
    if (!Array.isArray(experiences) || experiences.length === 0) {
      return { success: true, count: 0 };
    }

    const values = experiences.map(exp => [
      exp.bot_id,
      exp.type,
      JSON.stringify(exp.context),
      exp.action,
      JSON.stringify(exp.outcome),
      exp.outcome.success ? 1 : 0,
      exp.fitness_score !== undefined && exp.fitness_score !== null ? exp.fitness_score : null
    ]);

    const query = `
      INSERT INTO experience_log (bot_id, type, context, action, outcome, success, fitness_score)
      VALUES ${values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}
    `;

    const params = values.flat();

    try {
      await this._runQuery(query, params);
      return { success: true, count: experiences.length };
    } catch (err) {
      throw new Error(`Failed to save experiences: ${err.message}`);
    }
  }

  async saveSnapshot(botId, type, data) {
    const insertResult = await this._runQuery(
      `INSERT INTO evolution_snapshots (bot_id, snapshot_type, data) VALUES (?, ?, ?)`,
      [botId, type, JSON.stringify(data)]
    );

    const idResult = await this._getOne('SELECT last_insert_rowid() as id');

    return { success: true, id: idResult.id };
  }

  async getSnapshots(botId, limit = 10) {
    const query = `
      SELECT id, bot_id, snapshot_type, data, created_at
      FROM evolution_snapshots
      WHERE bot_id = ?
      ORDER BY id DESC
      LIMIT ?
    `;

    const results = await this._getAll(query, [botId, limit]);
    return results.map(result => ({
      id: result.id,
      bot_id: result.bot_id,
      snapshot_type: result.snapshot_type,
      data: JSON.parse(result.data),
      created_at: result.created_at
    }));
  }

  async loadSnapshot(snapshotId) {
    const query = `
      SELECT id, bot_id, snapshot_type, data, created_at
      FROM evolution_snapshots
      WHERE id = ?
    `;

    const result = await this._getOne(query, [snapshotId]);

    if (!result) {
      return null;
    }

    try {
      return {
        id: result.id,
        bot_id: result.bot_id,
        snapshot_type: result.snapshot_type,
        data: JSON.parse(result.data),
        created_at: result.created_at
      };
    } catch (err) {
      throw new Error(`Failed to parse snapshot data: ${err.message}`);
    }
  }

  async queryExperience(botId, type, limit = 100) {
    const query = `
      SELECT id, bot_id, type, context, action, outcome, success, fitness_score, created_at
      FROM experience_log
      WHERE bot_id = ? AND type = ?
      ORDER BY id DESC
      LIMIT ?
    `;

    const results = await this._getAll(query, [botId, type, limit]);
    return results.map(result => ({
      id: result.id,
      bot_id: result.bot_id,
      type: result.type,
      context: JSON.parse(result.context),
      action: result.action,
      outcome: JSON.parse(result.outcome),
      success: result.success === 1,
      fitness_score: result.fitness_score,
      created_at: result.created_at
    }));
  }

  async getWeightHistory(botId, domain, limit = 10) {
    const query = `
      SELECT id, bot_id, domain, weight_vector, version, created_at, updated_at
      FROM evolution_weights
      WHERE bot_id = ? AND domain = ?
      ORDER BY version DESC
      LIMIT ?
    `;

    const results = await this._getAll(query, [botId, domain, limit]);
    return results.map(result => ({
      id: result.id,
      bot_id: result.bot_id,
      domain: result.domain,
      weight_vector: JSON.parse(result.weight_vector),
      version: result.version,
      created_at: result.created_at,
      updated_at: result.updated_at
    }));
  }

  async cleanupOldExperiences(botId, type, maxCount = 1000) {
    const getIdsToDeleteQuery = `
      SELECT id FROM experience_log
      WHERE bot_id = ? AND type = ?
      ORDER BY id DESC
      LIMIT -1 OFFSET ?
    `;

    const getIdsResult = await this._getAll(getIdsToDeleteQuery, [botId, type, maxCount]);
    const idsToDelete = getIdsResult.map(r => r.id);

    if (idsToDelete.length === 0) {
      return { success: true, cleaned: 0 };
    }

    const deleteQuery = `
      DELETE FROM experience_log
      WHERE id IN (${idsToDelete.map(() => '?').join(', ')})
    `;

    try {
      await this._runQuery(deleteQuery, idsToDelete);
      return { success: true, cleaned: idsToDelete.length };
    } catch (err) {
      throw new Error(`Failed to cleanup old experiences: ${err.message}`);
    }
  }

  async _runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastInsertRowID: this.lastInsertRowID, changes: this.changes });
        }
      });
    });
  }

  async _getOne(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async _getAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = EvolutionStorage;
