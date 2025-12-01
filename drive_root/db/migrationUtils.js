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
  if (s.includes('CHARACTER VARYING') || s.includes('VARCHAR') || s === 'TEXT') return 'STRING';
  if (s.includes('INTEGER') || s.includes('BIGINT') || s.includes('SMALLINT')) return 'INTEGER';
  if (s.includes('BOOLEAN')) return 'BOOLEAN';
  if (s.includes('DATE')) return 'DATE';
  if (s.includes('TIMESTAMP')) return 'DATE';
  if (s.includes('JSON')) return 'JSON';
  return s;
}

module.exports = {
  normalizeType
};
