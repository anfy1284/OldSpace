const eventBus = require('../../drive_root/eventBus');
const global = require('../../drive_root/globalServerContext');
const { modelsDB } = global;

// Хранилище SSE-клиентов: Map<chatId, Set<{res, userId, clientId}>>
// Храним в global, чтобы не терялось при hot-reload модуля
if (!global.messengerSseClients) {
    global.messengerSseClients = new Map();
    console.log('[messenger] Initialized global SSE clients Map');
}
const sseClients = global.messengerSseClients;

eventBus.on('userCreated', async (user, { systems, roles, sessionID }) => {
    if (!modelsDB || !modelsDB.Users || !modelsDB.Messenger_Chats || !modelsDB.Messenger_ChatMembers) {
        console.warn('[messenger] Модели недоступны при создании пользователя');
        return;
    }

    try {
        const sequelize = modelsDB.Users.sequelize;
        await sequelize.transaction(async (t) => {
            // 1. Создать приватные чаты с каждым существующим пользователем
            const existingUsers = await modelsDB.Users.findAll({ 
                where: { id: { [require('sequelize').Op.ne]: user.id } },
                transaction: t 
            });
            
            for (const existingUser of existingUsers) {
                // Проверяем, нет ли уже чата между этими пользователями
                const memberships = await modelsDB.Messenger_ChatMembers.findAll({
                    where: { userId: [user.id, existingUser.id] },
                    transaction: t
                });
                
                const chatMap = new Map();
                for (const m of memberships) {
                    const arr = chatMap.get(m.chatId) || [];
                    arr.push(m.userId);
                    chatMap.set(m.chatId, arr);
                }
                
                let hasPrivate = false;
                for (const members of chatMap.values()) {
                    const set = new Set(members);
                    if (set.has(user.id) && set.has(existingUser.id) && set.size === 2) {
                        hasPrivate = true;
                        break;
                    }
                }
                
                if (!hasPrivate) {
                    await createTwoUserChat({ userId1: user.id, userId2: existingUser.id });
                    console.log(`[messenger] Создан приватный чат: ${user.name} ↔ ${existingUser.name}`);
                }
            }

            // 2. Добавить нового пользователя в общий чат "Local chat" из defaultValuesCache
            const localChat = global.getDefaultValue('messenger', 'Messenger_Chats', 1);
            if (localChat) {
                // Проверяем, не состоит ли уже в чате
                const existing = await modelsDB.Messenger_ChatMembers.findOne({
                    where: { chatId: localChat.id, userId: user.id },
                    transaction: t
                });
                
                if (!existing) {
                    await modelsDB.Messenger_ChatMembers.create({
                        chatId: localChat.id,
                        userId: user.id,
                        role: 'member',
                        customName: 'Local chat',
                        joinedAt: new Date(),
                        isActive: true,
                    }, { transaction: t });
                    console.log(`[messenger] Пользователь ${user.name} добавлен в Local chat`);
                }
            }
        });
    } catch (e) {
        console.error('[messenger] Ошибка обработки userCreated:', e.message);
    }
});

function onLoad(params, sessionID) {
    // Пока пустая, можно использовать для инициализации
    return { success: true };
}

async function loadChats(params, sessionID) {
    if (!modelsDB || !modelsDB.Messenger_Chats || !modelsDB.Messenger_ChatMembers) {
        return { error: 'Модели мессенджера недоступны' };
    }

    // Получаем пользователя из сессии (await!)
    const user = await global.getUserBySessionID(sessionID);
    if (!user) {
        return { error: 'Пользователь не авторизован' };
    }

    try {
        // Находим все чаты, в которых состоит пользователь
        const memberships = await modelsDB.Messenger_ChatMembers.findAll({
            where: { userId: user.id, isActive: true },
            include: [{
                model: modelsDB.Messenger_Chats,
                as: 'chat',
                where: { isActive: true },
                required: true
            }]
        });

        const chats = memberships.map(m => ({
            chatId: m.chatId,
            name: m.customName || m.chat.name,
            role: m.role,
            joinedAt: m.joinedAt
        }));

        return { chats };
    } catch (e) {
        console.error('[messenger] Ошибка loadChats:', e.message);
        return { error: 'Ошибка загрузки чатов: ' + e.message };
    }
}

async function loadMessages(params, sessionID) {
    const { chatId } = params || {};
    
    if (!chatId) {
        return { error: 'Не указан chatId' };
    }
    
    if (!modelsDB || !modelsDB.Messenger_Messages || !modelsDB.Messenger_ChatMembers) {
        return { error: 'Модели мессенджера недоступны' };
    }

    // Получаем пользователя из сессии
    const user = await global.getUserBySessionID(sessionID);
    if (!user) {
        return { error: 'Пользователь не авторизован' };
    }

    try {
        // Проверяем, что пользователь состоит в чате
        const membership = await modelsDB.Messenger_ChatMembers.findOne({
            where: { chatId, userId: user.id, isActive: true }
        });
        
        if (!membership) {
            return { error: 'Доступ к чату запрещён' };
        }

        // Загружаем сообщения чата с информацией об авторах
        const messages = await modelsDB.Messenger_Messages.findAll({
            where: { chatId },
            include: [{
                model: modelsDB.Users,
                as: 'author',
                attributes: ['id', 'name']
            }],
            order: [['createdAt', 'ASC']],
            limit: 100 // Последние 100 сообщений
        });

        const formattedMessages = messages.map(m => ({
            id: m.id,
            content: m.content,
            authorId: m.userId,
            authorName: m.author ? m.author.name : 'Unknown',
            createdAt: m.createdAt,
            isRead: m.isRead
        }));

        return { messages: formattedMessages, chatName: membership.customName };
    } catch (e) {
        console.error('[messenger] Ошибка loadMessages:', e.message);
        return { error: 'Ошибка загрузки сообщений: ' + e.message };
    }
}

// SSE подписка на обновления чата
function subscribeToChat(params, sessionID, req, res) {
    let { chatId } = params || {};
    chatId = parseInt(chatId); // Приводим к числу
    
    if (!chatId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Не указан chatId' }));
        return { _handled: true };
    }
    
    if (!modelsDB || !modelsDB.Messenger_ChatMembers) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Модели мессенджера недоступны' }));
        return { _handled: true };
    }

    // Асинхронная проверка доступа и установка SSE
    (async () => {
        try {
            // Получаем пользователя
            const user = await global.getUserBySessionID(sessionID);
            if (!user) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Пользователь не авторизован' }));
                return;
            }

            // Проверяем доступ
            const membership = await modelsDB.Messenger_ChatMembers.findOne({
                where: { chatId, userId: user.id, isActive: true }
            });
            
            if (!membership) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Доступ к чату запрещён' }));
                return;
            }

        // Настраиваем SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Добавляем клиента
        const clientId = Math.random().toString(36).substr(2, 9);
        console.log('[messenger] subscribeToChat: chatId =', chatId, 'type:', typeof chatId, 'clientId:', clientId);
        if (!sseClients.has(chatId)) {
            sseClients.set(chatId, new Set());
        }
        const client = { res, userId: user.id, clientId };
        sseClients.get(chatId).add(client);
        
        console.log(`[messenger] [${new Date().toISOString()}] SSE: пользователь ${user.name} подписался на чат ${chatId} (client: ${clientId})`);
        console.log('[messenger] sseClients keys:', Array.from(sseClients.keys()), 'total clients:', sseClients.get(chatId).size);

        // Отправляем подтверждение подключения
        res.write(`data: ${JSON.stringify({ type: 'connected', chatId })}\n\n`);

        // Обработчик отключения
        req.on('close', () => {
            console.log(`[messenger] [${new Date().toISOString()}] req.on('close') triggered for user ${user.name} chat ${chatId} (client: ${clientId})`);
            const clients = sseClients.get(chatId);
            console.log('[messenger] Clients in map before delete:', clients?.size || 0);
            if (clients) {
                clients.delete(client);
                console.log('[messenger] Clients in map after delete:', clients.size);
                if (clients.size === 0) {
                    sseClients.delete(chatId);
                    console.log('[messenger] Deleted chatId from Map:', chatId);
                }
            }
            console.log(`[messenger] [${new Date().toISOString()}] SSE: пользователь ${user.name} отключился от чата ${chatId} (client: ${clientId})`);
        });
        
            console.log(`[messenger] [${new Date().toISOString()}] Close handler registered (client: ${clientId})`);
            console.log('[messenger] Map state after setup:', Array.from(sseClients.keys()), 'size:', sseClients.get(chatId)?.size);
        } catch (e) {
            console.error('[messenger] Ошибка subscribeToChat:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка подписки: ' + e.message }));
        }
    })();
    
    // Возвращаем сразу, чтобы не блокировать
    return { _handled: true };
}

// Рассылка сообщения всем подписчикам чата
function broadcastMessage(chatId, message) {
    console.log('[messenger] broadcastMessage: chatId =', chatId, 'type:', typeof chatId);
    console.log('[messenger] sseClients keys:', Array.from(sseClients.keys()));
    console.log('[messenger] broadcastMessage called:', { chatId, clientsCount: sseClients.get(chatId)?.size || 0 });
    const clients = sseClients.get(chatId);
    if (!clients || clients.size === 0) {
        console.log('[messenger] No clients subscribed to chat', chatId);
        return;
    }

    const data = JSON.stringify({
        type: 'newMessage',
        message
    });
    console.log('[messenger] Broadcasting to', clients.size, 'clients:', data);

    clients.forEach(client => {
        try {
            client.res.write(`data: ${data}\n\n`);
            console.log('[messenger] Message sent to client userId:', client.userId);
        } catch (e) {
            console.error('[messenger] Ошибка отправки SSE:', e.message);
            clients.delete(client);
        }
    });
}

async function sendMessage(params, sessionID) {
    let { chatId, content } = params || {};
    chatId = parseInt(chatId); // Приводим к числу
    console.log('[messenger] sendMessage called:', { chatId, content, sessionID });
    console.log('[messenger] sendMessage: sseClients keys at start:', Array.from(sseClients.keys()), 'size for chatId:', sseClients.get(chatId)?.size);
    
    if (!chatId) {
        return { error: 'Не указан chatId' };
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return { error: 'Сообщение не может быть пустым' };
    }
    
    if (!modelsDB || !modelsDB.Messenger_Messages || !modelsDB.Messenger_ChatMembers) {
        return { error: 'Модели мессенджера недоступны' };
    }

    // Получаем пользователя из сессии
    const user = await global.getUserBySessionID(sessionID);
    if (!user) {
        return { error: 'Пользователь не авторизован' };
    }

    const sequelize = modelsDB.Users.sequelize;
    
    try {
        const result = await sequelize.transaction(async (t) => {
            // Проверяем, что пользователь состоит в чате
            const membership = await modelsDB.Messenger_ChatMembers.findOne({
                where: { chatId, userId: user.id, isActive: true },
                transaction: t
            });
            
            if (!membership) {
                throw new Error('Доступ к чату запрещён');
            }

            // Создаём сообщение
            const message = await modelsDB.Messenger_Messages.create({
                chatId,
                userId: user.id,
                content: content.trim(),
                isRead: false,
                isDelivered: true
            }, { transaction: t });

            return {
                id: message.id,
                content: message.content,
                authorId: user.id,
                authorName: user.name,
                createdAt: message.createdAt
            };
        });
        
        // Рассылаем сообщение всем подписчикам ПОСЛЕ успешной транзакции
        console.log('[messenger] Calling broadcastMessage:', { chatId, message: result });
        broadcastMessage(chatId, result);
        console.log('[messenger] broadcastMessage completed');

        return { 
            success: true, 
            message: result
        };
    } catch (e) {
        console.error('[messenger] Ошибка sendMessage:', e.message);
        return { error: 'Ошибка отправки сообщения: ' + e.message };
    }
}


// Создать приватный чат для двух пользователей
// params: { userId1: number, userId2: number }
async function createTwoUserChat(params, sessionID) {
    const { userId1, userId2 } = params || {};
    if (!userId1 || !userId2 || userId1 === userId2) {
        return { error: 'Нужны два разных пользователя: userId1 и userId2' };
    }
    if (!modelsDB || !modelsDB.Messenger_Chats || !modelsDB.Messenger_ChatMembers || !modelsDB.Users) {
        return { error: 'Модели мессенджера недоступны' };
    }

    const sequelize = modelsDB.Users.sequelize;
    return await sequelize.transaction(async (t) => {
        // Получаем имена пользователей для персональных названий
        const u1 = await modelsDB.Users.findByPk(userId1, { transaction: t });
        const u2 = await modelsDB.Users.findByPk(userId2, { transaction: t });
        if (!u1 || !u2) {
            throw new Error('Пользователь не найден');
        }

        // Создаём чат, владелец — первый пользователь
        const chat = await modelsDB.Messenger_Chats.create({
            userId: userId1,
            name: `Диалог: ${u1.name} ↔ ${u2.name}`,
            description: 'Приватный диалог двух пользователей',
            isActive: true,
        }, { transaction: t });

        // Добавляем обоих участников с персональными именами (customName)
        await modelsDB.Messenger_ChatMembers.create({
            chatId: chat.id,
            userId: userId1,
            role: 'owner',
            customName: u2.name,
            joinedAt: new Date(),
            isActive: true,
        }, { transaction: t });

        await modelsDB.Messenger_ChatMembers.create({
            chatId: chat.id,
            userId: userId2,
            role: 'member',
            customName: u1.name,
            joinedAt: new Date(),
            isActive: true,
        }, { transaction: t });

        return { chatId: chat.id };
    });
}


module.exports = { onLoad, loadChats, loadMessages, sendMessage, subscribeToChat, createTwoUserChat };