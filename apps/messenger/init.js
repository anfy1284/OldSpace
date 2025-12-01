// Инициализация приложения messenger: проверка и создание приватных чатов для всех пар пользователей
const global = require('../../drive_root/globalServerContext');
const messenger = require('./server');

async function ensurePrivateChatsForAllPairs() {
	const { modelsDB } = global;
	if (!modelsDB || !modelsDB.Users || !modelsDB.Messenger_Chats || !modelsDB.Messenger_ChatMembers) {
		console.warn('[messenger:init] Требуемые модели недоступны');
		return;
	}

	const sequelize = modelsDB.Users.sequelize;
	await sequelize.transaction(async (t) => {
		const users = await modelsDB.Users.findAll({ attributes: ['id', 'name'], transaction: t });
		// Перебираем уникальные пары (i<j)
		for (let i = 0; i < users.length; i++) {
			for (let j = i + 1; j < users.length; j++) {
				const u1 = users[i];
				const u2 = users[j];

				// Проверяем, есть ли уже приватный чат между этими пользователями
				// Критерий: чат, где оба участвуют как члены
				const existingMemberships = await modelsDB.Messenger_ChatMembers.findAll({
					where: { userId: [u1.id, u2.id] },
					transaction: t
				});

				// Группируем по chatId и проверяем наличие обеих userId
				const chatMap = new Map();
				for (const m of existingMemberships) {
					const arr = chatMap.get(m.chatId) || [];
					arr.push(m.userId);
					chatMap.set(m.chatId, arr);
				}
				let hasPrivate = false;
				for (const members of chatMap.values()) {
					const set = new Set(members);
					if (set.has(u1.id) && set.has(u2.id) && set.size === 2) {
						hasPrivate = true;
						break;
					}
				}

				if (!hasPrivate) {
					try {
						await messenger.createTwoUserChat({ userId1: u1.id, userId2: u2.id });
						console.log(`[messenger:init] Создан приватный чат: ${u1.name} ↔ ${u2.name}`);
					} catch (e) {
						console.error('[messenger:init] Ошибка создания чата для пары', u1.id, u2.id, e.message);
					}
				}
			}
		}
	});
}

// Запуск при инициализации приложения
ensurePrivateChatsForAllPairs().catch(e => {
	console.error('[messenger:init] Ошибка инициализации приватных чатов:', e.message);
});

// Проверка, что в общем чате "Local chat" состоят все пользователи; добавить отсутствующих
async function ensureLocalChatIncludesAllUsers() {
	const { modelsDB } = global;
	if (!modelsDB || !modelsDB.Users || !modelsDB.Messenger_Chats || !modelsDB.Messenger_ChatMembers) {
		console.warn('[messenger:init] Требуемые модели недоступны для Local chat');
		return;
	}

	const sequelize = modelsDB.Users.sequelize;
	await sequelize.transaction(async (t) => {
		// Получаем предопределённый общий чат через defaultValuesCache
		const localChatDefId = 1; // из apps/messenger/db/defaultValues.json
		const localChat = global.getDefaultValue('messenger', 'Messenger_Chats', localChatDefId);
		if (!localChat) {
			console.warn('[messenger:init] Не найден предопределённый "Local chat" в defaultValuesCache');
			return;
		}

		// Получить всех пользователей
		const users = await modelsDB.Users.findAll({ attributes: ['id', 'name'], transaction: t });
		// Текущие участники чата
		const members = await modelsDB.Messenger_ChatMembers.findAll({ where: { chatId: localChat.id }, transaction: t });
		const existingIds = new Set(members.map(m => m.userId));

		// Добавить отсутствующих
		for (const u of users) {
			if (!existingIds.has(u.id)) {
				await modelsDB.Messenger_ChatMembers.create({
					chatId: localChat.id,
					userId: u.id,
					role: u.id === localChat.userId ? 'owner' : 'member',
					customName: 'Local chat',
					joinedAt: new Date(),
					isActive: true,
				}, { transaction: t });
				console.log(`[messenger:init] Пользователь добавлен в Local chat: ${u.name}`);
			}
		}
	});
}

ensureLocalChatIncludesAllUsers().catch(e => {
	console.error('[messenger:init] Ошибка актуализации Local chat:', e.message);
});
