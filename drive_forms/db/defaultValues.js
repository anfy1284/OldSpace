// Уровень для предопределенных значений drive_forms
const LEVEL = 'forms';

const defaultValuesData = {
  systems: [
    { id: 1, name: 'mySpace' }
  ],
  access_roles: [
    { id: 2, name: 'admin' },
    { id: 3, name: 'public' },
    { id: 4, name: 'nologged' }
  ]
};

// Добавляем level к каждой записи и проверяем уникальность id
function processDefaultValues(data, level) {
  const result = {};
  const allIds = new Set();
  
  for (const [entity, records] of Object.entries(data)) {
    if (!Array.isArray(records)) {
      result[entity] = records;
      continue;
    }
    
    // Проверяем уникальность id в пределах уровня (все таблицы)
    for (const record of records) {
      if (record.id !== undefined) {
        if (allIds.has(record.id)) {
          console.error(`[defaultValues] ОШИБКА: Дублирующийся id=${record.id} в таблице "${entity}" (id должен быть уникален в пределах уровня "${level}")`);
        }
        allIds.add(record.id);
      } else {
        console.warn(`[defaultValues] ПРЕДУПРЕЖДЕНИЕ: Запись в "${entity}" не имеет поля id`);
      }
    }
    
    result[entity] = records.map(record => ({
      ...record,
      _level: level
    }));
  }
  return result;
}

module.exports = processDefaultValues(defaultValuesData, LEVEL);
module.exports.LEVEL = LEVEL;
