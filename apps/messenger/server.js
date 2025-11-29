// Пример подписки на событие создания пользователя для приложения messenger
const eventBus = require('../../drive_forms/eventBus');
const { modelsDB } = global;

eventBus.on('userCreated', async (user, { systems, roles, sessionID }) => {
    // Пример: создать чат для нового пользователя
    if (modelsDB && modelsDB.Messenger_Chats) {
        await modelsDB.Messenger_Chats.create({
            userId: user.id,
            name: `Чат пользователя ${user.name}`,
            description: 'Личный чат создан автоматически',
            isActive: true
        });
        console.log(`[messenger] Личный чат создан для пользователя ${user.name}`);
    }
    // Здесь можно добавить создание аватарки и другие действия
});

function onLoad(params, sessionID) {
    let s = 123;
    s += 1;
    //const guestUser = await formsGlobal.createGuestUser(sessionID, ['mySpace'], ['public']);
}

module.exports = { onLoad };