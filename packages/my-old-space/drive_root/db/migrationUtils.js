// Утилиты для миграций БД

/**
 * Нормализует тип поля из describeTable (Postgres) для сравнения с определениями Sequelize.
 * Приводит различные диалектные варианты к единому ключу.
 * @param {string} t - Тип поля из БД (например, "CHARACTER VARYING(255)")
 * @returns {string} - Нормализованный тип (например, "STRING")
 */
function normalizeType(t) {
  if (!t) return '';
  const s = String(t).toUpperCase();

  // Строковые типы
  if (s.includes('CHARACTER VARYING') || s.includes('VARCHAR')) return 'STRING';
  if (s === 'TEXT') return 'TEXT';

  // Числовые типы (отделяем по разрядности)
  if (s === 'INTEGER' || s === 'INT4' || s === 'INT') return 'INTEGER';
  if (s === 'BIGINT' || s === 'INT8') return 'BIGINT';
  if (s === 'SMALLINT' || s === 'INT2') return 'SMALLINT';

  // Булевы
  if (s === 'BOOLEAN' || s === 'BOOL') return 'BOOLEAN';

  // Даты
  if (s.includes('DATE') || s.includes('TIMESTAMP')) return 'DATE';

  // JSON
  if (s.includes('JSON')) return 'JSON';

  return s;
}

async function compareSchemas(currentSchema, desiredSchema) {
  const Sequelize = require('sequelize');
  let needsMigration = false;
  const differences = [];
  const commonFields = [];

  for (const [fieldName, fieldDef] of Object.entries(desiredSchema)) {
    if (!currentSchema[fieldName]) {
      differences.push(`+ Добавлено поле: ${fieldName}`);
      needsMigration = true;
    } else {
      const dbCol = currentSchema[fieldName];

      // 1. Проверка типа
      const currentTypeNorm = normalizeType(dbCol.type);
      const desiredTypeNorm = (Sequelize.DataTypes[fieldDef.type].key || fieldDef.type).toUpperCase();

      // Специальная обработка: Sequelize STRING -> VARCHAR(255) -> STRING
      // Если в JSON "STRING", а в базе "CHARACTER VARYING(255)", это совпадение.
      if (currentTypeNorm !== desiredTypeNorm) {
        differences.push(`~ Изменен тип поля ${fieldName}: ${dbCol.type} (норм: ${currentTypeNorm}) -> ${desiredTypeNorm}`);
        needsMigration = true;
      }

      // 2. Проверка allowNull
      const desiredAllowNull = fieldDef.allowNull === undefined ? true : !!fieldDef.allowNull;
      const currentAllowNull = !!dbCol.allowNull;
      if (currentAllowNull !== desiredAllowNull) {
        differences.push(`~ Изменено свойство allowNull ${fieldName}: ${currentAllowNull} -> ${desiredAllowNull}`);
        needsMigration = true;
      }

      // 3. Проверка primaryKey
      const desiredPK = !!fieldDef.primaryKey;
      const currentPK = !!dbCol.primaryKey;
      if (currentPK !== desiredPK) {
        differences.push(`~ Изменен статус primaryKey ${fieldName}: ${currentPK} -> ${desiredPK}`);
        needsMigration = true;
      }

      commonFields.push(fieldName);
    }
  }

  for (const fieldName of Object.keys(currentSchema)) {
    if (!desiredSchema[fieldName] && !['createdAt', 'updatedAt'].includes(fieldName)) {
      differences.push(`- Удалено поле: ${fieldName}`);
      needsMigration = true;
    }
  }

  return { needsMigration, differences, commonFields };
}

async function syncUniqueConstraints(sequelize, transaction, tableName, desiredSchema) {
  try {
    const uniqueConstraints = await sequelize.query(
      `SELECT c.conname, string_agg(a.attname, ',') AS cols
           FROM pg_constraint c
           JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
           JOIN pg_attribute a ON a.attnum = k.attnum AND a.attrelid = c.conrelid
           WHERE c.conrelid = '"${tableName}"'::regclass AND c.contype = 'u'
           GROUP BY c.conname`,
      { transaction, type: require('sequelize').QueryTypes.SELECT }
    );

    for (const uc of uniqueConstraints) {
      const cols = (uc.cols || '').split(',').map(s => s.trim()).filter(Boolean);
      const allColsStillUnique = cols.every(col => desiredSchema[col] && desiredSchema[col].unique);
      if (!allColsStillUnique) {
        await sequelize.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${uc.conname}"`, { transaction });
        console.log(`[MIGRATION] Dropped unique constraint ${uc.conname} on ${tableName} (${cols.join(',')})`);
      }
    }
  } catch (err) {
    console.error(`[MIGRATION] Не удалось обработать уникальные ограничения для ${tableName}:`, err.message || err);
  }
}

module.exports = {
  normalizeType,
  compareSchemas,
  syncUniqueConstraints
};
