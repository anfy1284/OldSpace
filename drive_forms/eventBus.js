// Простой асинхронный EventBus для Node.js
const events = {};

module.exports = {
  /**
   * Подписка на событие
   * @param {string} event - имя события
   * @param {function} handler - async-функция-обработчик
   */
  on(event, handler) {
    if (!events[event]) events[event] = [];
    events[event].push(handler);
  },

  /**
   * Вызов всех обработчиков события
   * @param {string} event - имя события
   * @param  {...any} args - аргументы для обработчиков
   */
  async emit(event, ...args) {
    if (events[event]) {
      for (const handler of events[event]) {
        await handler(...args);
      }
    }
  },

  /**
   * Сбросить все обработчики (для тестов или перезапуска)
   */
  clear() {
    Object.keys(events).forEach(e => delete events[e]);
  }
};
