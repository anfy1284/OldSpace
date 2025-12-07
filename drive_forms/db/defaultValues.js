// Level for default values of drive_forms
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

// Add level to each record and check id uniqueness
function processDefaultValues(data, level) {
  const result = {};
  const allIds = new Set();

  for (const [entity, records] of Object.entries(data)) {
    if (!Array.isArray(records)) {
      result[entity] = records;
      continue;
    }

    // Check id uniqueness within the level (all tables)
    for (const record of records) {
      if (record.id !== undefined) {
        if (allIds.has(record.id)) {
          console.error(`[defaultValues] ERROR: Duplicate id=${record.id} in table "${entity}" (id must be unique within level "${level}")`);
        }
        allIds.add(record.id);
      } else {
        console.warn(`[defaultValues] WARNING: Record in "${entity}" does not have an id field`);
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
