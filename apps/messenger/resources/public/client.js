const formMessenger = new Form();
formMessenger.setTitle('Messenger');

// Занять 1/3 ширины экрана, 100% высоты, у правого края
const screenWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
const formWidth = Math.round(screenWidth / 2);
formMessenger.setWidth(formWidth);
formMessenger.setHeight(screenHeight);
formMessenger.setX(screenWidth - formWidth);
formMessenger.setY(0);
formMessenger.displayMemory = '0';
formMessenger.dotPressed = false;
formMessenger.operationGiven = false;
formMessenger.operation = null;
formMessenger.value1 = '';
formMessenger.value2 = '';
formMessenger.isError = false;

// Функция обновления данных формы
formMessenger.refresh = function() {
	callServerMethod('messenger', 'loadChats', {})
		.then(result => {
			if (result.error) {
				console.error('[Messenger] Ошибка:', result.error);
				return;
			}
			
			// Очищаем область чатов
			const chatsContainer = formMessenger.chatsContainer;
			if (chatsContainer) {
				chatsContainer.innerHTML = '';
				
				// Отображаем чаты в столбик с выравниванием по верху
				if (result.chats && result.chats.length > 0) {
					result.chats.forEach(chat => {
						const chatDiv = document.createElement('div');
						chatDiv.style.padding = '8px';
						chatDiv.style.borderBottom = '1px solid #ccc';
						chatDiv.style.cursor = 'pointer';
						chatDiv.style.textAlign = 'left';
						chatDiv.style.verticalAlign = 'top';
						chatDiv.textContent = chat.name;
						
						// Подсветка при наведении
						chatDiv.addEventListener('mouseenter', function() {
							this.style.backgroundColor = '#e0e0e0';
						});
						chatDiv.addEventListener('mouseleave', function() {
							this.style.backgroundColor = '';
						});
						
					// Обработчик клика
					chatDiv.addEventListener('click', function() {
						console.log('[Messenger] Выбран чат:', chat.name, 'ID:', chat.chatId);
						formMessenger.loadChatMessages(chat.chatId);
					});						chatsContainer.appendChild(chatDiv);
					});
				} else {
					chatsContainer.textContent = 'Нет чатов';
					chatsContainer.style.padding = '8px';
					chatsContainer.style.color = '#888';
				}
			}
		})
		.catch(err => {
			console.error('[Messenger] Ошибка обновления: ' + err.message);
		});
};

// Функция загрузки сообщений чата
formMessenger.loadChatMessages = function(chatId) {
	if (!chatId) return;
	
	const messagesContainer = this.messagesContainer;
	if (!messagesContainer) return;
	
	// Показываем индикатор загрузки
	messagesContainer.innerHTML = '<div style="padding: 8px; color: #888;">Загрузка сообщений...</div>';
	
	callServerMethod('messenger', 'loadMessages', { chatId })
		.then(result => {
			if (result.error) {
				console.error('[Messenger] Ошибка:', result.error);
				messagesContainer.innerHTML = '<div style="padding: 8px; color: red;">Ошибка: ' + result.error + '</div>';
				return;
			}
			
			// Очищаем область сообщений
			messagesContainer.innerHTML = '';
			
			// Отображаем сообщения
			if (result.messages && result.messages.length > 0) {
				result.messages.forEach(msg => {
					const msgDiv = document.createElement('div');
					msgDiv.style.marginBottom = '12px';
					msgDiv.style.padding = '8px';
					msgDiv.style.borderRadius = '4px';
					msgDiv.style.backgroundColor = '#f5f5f5';
					
					// Заголовок: автор и время
					const headerDiv = document.createElement('div');
					headerDiv.style.fontSize = '12px';
					headerDiv.style.color = '#666';
					headerDiv.style.marginBottom = '4px';
					const timestamp = new Date(msg.createdAt).toLocaleString('ru-RU');
					headerDiv.textContent = `${msg.authorName} • ${timestamp}`;
					msgDiv.appendChild(headerDiv);
					
					// Текст сообщения
					const contentDiv = document.createElement('div');
					contentDiv.style.fontSize = '14px';
					contentDiv.textContent = msg.content;
					msgDiv.appendChild(contentDiv);
					
					messagesContainer.appendChild(msgDiv);
				});
				
				// Прокручиваем к последнему сообщению
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			} else {
				messagesContainer.innerHTML = '<div style="padding: 8px; color: #888;">Нет сообщений</div>';
			}
			
			// Сохраняем текущий chatId и включаем ввод
			this.currentChatId = chatId;
			if (this.messageInput) this.messageInput.disabled = false;
			if (this.sendButton) this.sendButton.disabled = false;
			
			// Подключаем SSE для автообновления
			this.connectSSE(chatId);
		})
		.catch(err => {
			console.error('[Messenger] Ошибка загрузки сообщений:', err.message);
			messagesContainer.innerHTML = '<div style="padding: 8px; color: red;">Ошибка загрузки</div>';
		});
};

// Функция отправки сообщения
formMessenger.sendMessage = function(content) {
	if (!this.currentChatId || !content) return;
	
	// Отключаем ввод на время отправки
	if (this.messageInput) this.messageInput.disabled = true;
	if (this.sendButton) this.sendButton.disabled = true;
	
	callServerMethod('messenger', 'sendMessage', { chatId: this.currentChatId, content })
		.then(result => {
			if (result.error) {
				console.error('[Messenger] Ошибка отправки:', result.error);
				alert('Ошибка: ' + result.error);
				return;
			}
			
			if (result.success && result.message) {
				// Очищаем поле ввода
				if (this.messageInput) this.messageInput.value = '';
				// Сообщение будет добавлено автоматически через SSE
			}
		})
		.catch(err => {
			console.error('[Messenger] Ошибка отправки сообщения:', err.message);
			alert('Ошибка отправки');
		})
		.finally(() => {
			// Включаем ввод обратно
			if (this.messageInput) this.messageInput.disabled = false;
			if (this.sendButton) this.sendButton.disabled = false;
			if (this.messageInput) this.messageInput.focus();
		});
};

// Подключение к SSE для автообновления сообщений
formMessenger.connectSSE = function(chatId) {
	// Если уже подключены к этому чату, не переподключаемся
	if (this.eventSource && this.sseConnectedChatId === chatId) {
		console.log('[Messenger] SSE уже подключен к чату', chatId);
		return;
	}
	
	// Закрываем предыдущее соединение
	if (this.eventSource) {
		console.log('[Messenger] Закрываем предыдущее SSE соединение');
		this.eventSource.close();
		this.eventSource = null;
		this.sseConnectedChatId = null;
	}
	
	if (!chatId) return;
	
	this.sseConnectedChatId = chatId;
	
	try {
		// Создаём EventSource (формат: /app/messenger/subscribeToChat?chatId=...)
		const url = `/app/messenger/subscribeToChat?chatId=${chatId}`;
		this.eventSource = new EventSource(url);
		
		this.eventSource.onopen = () => {
			console.log('[Messenger] SSE подключено к чату', chatId);
		};
		
		this.eventSource.onmessage = (event) => {
			console.log('[Messenger] SSE event received:', event.data);
			try {
				const data = JSON.parse(event.data);
				console.log('[Messenger] SSE parsed data:', data);
				
				if (data.type === 'connected') {
					console.log('[Messenger] SSE: подтверждение подключения');
				} else if (data.type === 'newMessage') {
					// Новое сообщение от сервера
					console.log('[Messenger] Новое сообщение через SSE:', data.message);
					this.addMessageToUI(data.message);
				}
			} catch (e) {
				console.error('[Messenger] Ошибка обработки SSE:', e.message);
			}
		};
		
		this.eventSource.onerror = (error) => {
			console.error('[Messenger] SSE ошибка:', error);
			if (this.eventSource.readyState === EventSource.CLOSED) {
				console.log('[Messenger] SSE соединение закрыто');
			}
		};
	} catch (e) {
		console.error('[Messenger] Ошибка создания SSE:', e.message);
	}
};

// Добавление сообщения в UI
formMessenger.addMessageToUI = function(msg) {
	const messagesContainer = this.messagesContainer;
	if (!messagesContainer) return;
	
	const msgDiv = document.createElement('div');
	msgDiv.style.marginBottom = '12px';
	msgDiv.style.padding = '8px';
	msgDiv.style.borderRadius = '4px';
	msgDiv.style.backgroundColor = '#f5f5f5';
	
	// Заголовок
	const headerDiv = document.createElement('div');
	headerDiv.style.fontSize = '12px';
	headerDiv.style.color = '#666';
	headerDiv.style.marginBottom = '4px';
	const timestamp = new Date(msg.createdAt).toLocaleString('ru-RU');
	headerDiv.textContent = `${msg.authorName} • ${timestamp}`;
	msgDiv.appendChild(headerDiv);
	
	// Текст сообщения
	const contentDiv = document.createElement('div');
	contentDiv.style.fontSize = '14px';
	contentDiv.textContent = msg.content;
	msgDiv.appendChild(contentDiv);
	
	messagesContainer.appendChild(msgDiv);
	
	// Прокручиваем к последнему сообщению
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

formMessenger.onDraw = function(parent) {
	// Вызываем базовую реализацию
	Form.prototype.onDraw.call(this, parent);
	
	// Создаём таблицу с видимыми границами для отладки
	const table = document.createElement('table');
	this.getContentArea().appendChild(table);
	table.style.width = '100%';
	table.style.height = '100%';
	table.style.borderCollapse = 'collapse';
	table.style.tableLayout = 'fixed';
	table.style.border = '1px solid black';

	// Одна строка, два столбца (левый 1/4, правый 3/4)
	const row = document.createElement('tr');
	table.appendChild(row);


	// Левый столбец (1/4 ширины)
	const leftCell = document.createElement('td');
	leftCell.style.width = '25%';
	leftCell.style.border = '1px solid black';
	leftCell.style.verticalAlign = 'top';
	row.appendChild(leftCell);

	// Вложенная таблица в левом столбце (2 строки)
	const leftTable = document.createElement('table');
	leftTable.style.width = '100%';
	leftTable.style.height = '100%';
	leftTable.style.borderCollapse = 'collapse';
	leftTable.style.tableLayout = 'fixed';
	leftTable.style.border = '1px solid black';
	leftCell.appendChild(leftTable);

	// Верхняя ячейка (30px) — Label 'Chats'
	const leftRowTop = document.createElement('tr');
	leftTable.appendChild(leftRowTop);
	const leftCellTop = document.createElement('td');
	leftCellTop.style.border = '1px solid black';
	leftCellTop.style.height = '30px';
	leftRowTop.appendChild(leftCellTop);

	// Label 'Chats' (используем UI_classes.js)
	const chatsLabel = new Label(leftCellTop);
	chatsLabel.setText('Chats');
	chatsLabel.setParent(leftCellTop);
	chatsLabel.onDraw(leftCellTop);
	chatsLabel.setFontSize('18px');
	chatsLabel.setFontWeight('bold');
	chatsLabel.onDraw(leftCellTop);

	// Нижняя ячейка (всё остальное) — контейнер для списка чатов
	const leftRowBottom = document.createElement('tr');
	leftTable.appendChild(leftRowBottom);
	const leftCellBottom = document.createElement('td');
	leftCellBottom.style.border = '1px solid black';
	leftCellBottom.style.overflow = 'auto';
	leftCellBottom.style.verticalAlign = 'top';
	leftRowBottom.appendChild(leftCellBottom);
	
	// Сохраняем ссылку на контейнер чатов
	this.chatsContainer = leftCellBottom;

	// Правый столбец (3/4 ширины)
	const rightCell = document.createElement('td');
	rightCell.style.width = '75%';
	rightCell.style.border = '1px solid black';
	rightCell.style.verticalAlign = 'top';
	row.appendChild(rightCell);

	// Вложенная таблица в правом столбце
	const rightTable = document.createElement('table');
	rightTable.style.width = '100%';
	rightTable.style.height = '100%';
	rightTable.style.borderCollapse = 'collapse';
	rightTable.style.tableLayout = 'fixed';
	rightTable.style.border = '1px solid black';
	rightCell.appendChild(rightTable);

	// Верхняя ячейка (всё кроме 30px) — область сообщений
	const rightRowTop = document.createElement('tr');
	rightTable.appendChild(rightRowTop);
	const rightCellTop = document.createElement('td');
	rightCellTop.style.border = '1px solid black';
	rightCellTop.style.height = 'calc(100% - 30px)';
	rightCellTop.style.overflow = 'auto';
	rightCellTop.style.verticalAlign = 'top';
	rightCellTop.style.padding = '8px';
	rightRowTop.appendChild(rightCellTop);
	
	// Сохраняем ссылку на область сообщений
	this.messagesContainer = rightCellTop;

	// Нижняя ячейка (30px) — область ввода
	const rightRowBottom = document.createElement('tr');
	rightTable.appendChild(rightRowBottom);
	const rightCellBottom = document.createElement('td');
	rightCellBottom.style.border = '1px solid black';
	rightCellBottom.style.height = '30px';
	rightRowBottom.appendChild(rightCellBottom);
	
	// Сохраняем ссылку на область ввода
	this.inputContainer = rightCellBottom;
	
	// Создаём контейнер для элементов ввода с flex-разметкой
	const inputWrapper = document.createElement('div');
	inputWrapper.style.display = 'flex';
	inputWrapper.style.gap = '4px';
	inputWrapper.style.alignItems = 'center';
	inputWrapper.style.height = '100%';
	inputWrapper.style.padding = '4px';
	rightCellBottom.appendChild(inputWrapper);
	
	// TextBox для ввода
	const messageInput = document.createElement('input');
	messageInput.type = 'text';
	messageInput.placeholder = 'Введите сообщение...';
	messageInput.style.flex = '1';
	messageInput.style.padding = '4px 8px';
	messageInput.style.border = '1px solid #ccc';
	messageInput.style.borderRadius = '4px';
	messageInput.style.fontSize = '14px';
	messageInput.disabled = true; // Отключено до выбора чата
	inputWrapper.appendChild(messageInput);
	this.messageInput = messageInput;
	
	// Кнопка отправки
	const sendButton = document.createElement('button');
	sendButton.type = 'button'; // Важно! Чтобы не было submit формы
	sendButton.textContent = 'Отправить';
	sendButton.style.padding = '4px 12px';
	sendButton.style.border = '1px solid #007bff';
	sendButton.style.backgroundColor = '#007bff';
	sendButton.style.color = 'white';
	sendButton.style.borderRadius = '4px';
	sendButton.style.cursor = 'pointer';
	sendButton.style.fontSize = '14px';
	sendButton.disabled = true; // Отключено до выбора чата
	inputWrapper.appendChild(sendButton);
	this.sendButton = sendButton;
	
	// Обработчик отправки сообщения
	const sendMessageHandler = () => {
		const content = messageInput.value.trim();
		if (content && this.currentChatId) {
			this.sendMessage(content);
		}
	};
	
	// Клик на кнопку
	sendButton.addEventListener('click', sendMessageHandler);
	
	// Enter на текстовом поле
	messageInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault(); // Предотвращаем отправку формы
			sendMessageHandler();
		}
	});

	// Для отладки: заливка цветом
	// rightCellTop.style.background = '#eef';
	// rightCellBottom.style.background = '#fee';
	// leftCell.style.background = '#efe';

	callServerMethod('messenger', 'onLoad', {})
		.then(result => {
			console.log('[Messenger] Данные обновлены:', result);
			// Здесь можно обновить список чатов, сообщений и т.д.
		})
		.catch(err => {
			console.error('[Messenger] Ошибка обновления: ' + err.message);
		});

	// Первоначальная загрузка
	this.refresh();
};

formMessenger.onDraw(document.body);